"""Testes do servidor local (só biblioteca padrão).

    python -m unittest discover -s tests -v

Roda uma CÓPIA do server.py numa pasta temporária, numa porta livre, com um
servidor de arquivos de teste. Não toca na instalação real nem em config.json.
Os testes que precisam do yt-dlp são pulados se ele não estiver instalado.
"""

import http.client
import importlib.util
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SERVER_SRC = ROOT / "server" / "server.py"
EXT_ID = "hdmfifeopbmjcfjbjpkfjinejneohlji"          # ID fixo (chave do manifest.json)
EVIL_ID = "a" * 32


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class FileHandler(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


class SlowHandler(BaseHTTPRequestHandler):
    """Entrega um 'vídeo' devagar, para dar tempo de cancelar."""
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "video/mp4")
        self.send_header("Content-Length", str(50 * 1024 * 1024))
        self.end_headers()
        try:
            for _ in range(500):
                self.wfile.write(b"\0" * 1024)
                time.sleep(0.2)
        except Exception:
            pass

    def log_message(self, *a):
        pass


class ServerCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="nvf_test_"))
        (cls.tmp / "srv").mkdir()
        shutil.copy2(SERVER_SRC, cls.tmp / "srv" / "server.py")
        cls.www = cls.tmp / "www"
        cls.www.mkdir()
        (cls.www / "a.mp4").write_bytes(b"\0" * 4096)
        cls.out = cls.tmp / "downloads"

        cls.fport = free_port()
        handler = lambda *a, **k: FileHandler(*a, directory=str(cls.www), **k)
        cls.fs = ThreadingHTTPServer(("127.0.0.1", cls.fport), handler)
        threading.Thread(target=cls.fs.serve_forever, daemon=True).start()
        cls.sport = free_port()
        cls.slow = ThreadingHTTPServer(("127.0.0.1", cls.sport), SlowHandler)
        threading.Thread(target=cls.slow.serve_forever, daemon=True).start()

        cls.port = free_port()
        env = dict(os.environ, NOEVFX_PORT=str(cls.port))
        cls.proc = subprocess.Popen([sys.executable, str(cls.tmp / "srv" / "server.py")], env=env,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, cwd=str(cls.tmp))
        for _ in range(60):
            try:
                if cls.req("GET", "/health", {"X-NoeVFX-Client": "1"})[0] == 200:
                    break
            except Exception:
                time.sleep(0.25)
        cls.have_ytdlp = bool(cls.req("GET", "/health", cls.ext())[2].get("yt_dlp"))
        cls.req("POST", "/config", cls.ext(), {"output_dir": str(cls.out), "onboarded": True})

        spec = importlib.util.spec_from_file_location("srv_copy", cls.tmp / "srv" / "server.py")
        cls.mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.mod)

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        cls.fs.shutdown()
        cls.slow.shutdown()
        time.sleep(0.3)
        shutil.rmtree(cls.tmp, ignore_errors=True)

    # -- helpers ----------------------------------------------------------- #
    @classmethod
    def ext(cls, eid=EXT_ID, **extra):
        h = {"Origin": "chrome-extension://" + eid}
        h.update(extra)
        return h

    @classmethod
    def req(cls, method, path, headers=None, body=None, raw=None):
        c = http.client.HTTPConnection("127.0.0.1", cls.port, timeout=60)
        hdr = dict(headers or {})
        data = raw
        if body is not None:
            data = json.dumps(body)
            hdr["Content-Type"] = "application/json"
        c.request(method, path, body=data, headers=hdr)
        r = c.getresponse()
        txt = r.read()
        try:
            js = json.loads(txt.decode("utf-8"))
        except Exception:
            js = {}
        c.close()
        return r.status, dict(r.getheaders()), js

    def wait_job(self, jid, secs=40):
        for _ in range(int(secs * 4)):
            st = self.req("GET", "/status?id=" + jid, self.ext())[2]
            if st.get("status") in ("done", "error", "canceled"):
                return st
            time.sleep(0.25)
        return st

    # -- autenticação ------------------------------------------------------ #
    def test_sem_origem_nem_cabecalho_nega(self):
        self.assertEqual(self.req("GET", "/config")[0], 403)

    def test_leitura_sem_origin_vale_com_cabecalho_mas_escrita_nao(self):
        # o Chrome NÃO manda Origin nos GET da extensão (só nos POST): a leitura aceita o cabeçalho próprio
        h = {"X-NoeVFX-Client": "1"}
        for p in ("/config", "/jobs", "/health"):
            self.assertEqual(self.req("GET", p, h)[0], 200, p)
        self.assertEqual(self.req("GET", "/config")[0], 403)                                    # sem nada: nega
        for p, body in (("/config", {"fab_enabled": False}), ("/download", {"url": "http://x.com/a.mp4"}),
                        ("/open-folder", {}), ("/pick-folder", {}), ("/cancel", {"id": "x"})):
            self.assertEqual(self.req("POST", p, h, body)[0], 403, p)                           # escrever/executar exige o ID

    def test_site_malicioso_nega(self):
        self.assertEqual(self.req("GET", "/config", {"Origin": "http://evil.com", "X-NoeVFX-Client": "1"})[0], 403)
        self.assertEqual(self.req("POST", "/config", {"Origin": "http://evil.com", "Content-Type": "text/plain"}, raw="{}")[0], 403)

    def test_extensao_desconhecida_nega(self):
        self.assertEqual(self.req("GET", "/config", self.ext(EVIL_ID))[0], 403)
        self.assertEqual(self.req("POST", "/download", self.ext(EVIL_ID), {"url": "http://x.com/a.mp4"})[0], 403)

    def test_dns_rebinding_host_falso_nega(self):
        h = self.ext(Host="evil.example:%d" % self.port)
        self.assertEqual(self.req("GET", "/config", h)[0], 403)
        self.assertEqual(self.req("GET", "/jobs", {"Host": "evil.example:%d" % self.port, "X-NoeVFX-Client": "1"})[0], 403)

    def test_extensao_certa_passa_e_recebe_cors(self):
        st, hdr, js = self.req("GET", "/config", self.ext())
        self.assertEqual(st, 200)
        self.assertEqual(hdr.get("Access-Control-Allow-Origin"), "chrome-extension://" + EXT_ID)
        self.assertEqual(js["fab_enabled"], True)

    def test_preflight_so_para_extensao_certa(self):
        h = {"Access-Control-Request-Method": "POST"}
        self.assertEqual(self.req("OPTIONS", "/download", dict(h, Origin="http://evil.com"))[0], 403)
        self.assertEqual(self.req("OPTIONS", "/download", dict(h, **self.ext()))[0], 204)

    def test_health_completo_tem_api_version(self):
        js = self.req("GET", "/health", self.ext())[2]
        self.assertEqual(js["api_version"], self.mod.API_VERSION)
        self.assertIn("output_dir", js)

    # -- configuração e argumentos extras ---------------------------------- #
    def test_extra_args_proibidos_sao_recusados(self):
        for bad in ("--exec calc", "--exe calc", "-o C:/x/%(id)s", "--config-locations x", "--downloader aria2c",
                    "--print-to-file a b", "-P C:/tmp", "--cookies-from-browser chrome", "--js-runtimes deno:C:/x.exe",
                    "--proxy", "solto", "-f22"):
            st, _, js = self.req("POST", "/config", self.ext(), {"extra_args": bad})
            self.assertEqual(st, 400, bad)

    def test_extra_args_seguros_funcionam(self):
        ok = '--extractor-args "youtube:player_client=web" --write-subs --sub-langs pt,en -f "bv*+ba/b"'
        st, _, js = self.req("POST", "/config", self.ext(), {"extra_args": ok})
        self.assertEqual(st, 200)
        self.assertEqual(js["extra_args"], ok)
        self.assertEqual(self.mod.parse_extra_args(ok)[0:2], ["--extractor-args", "youtube:player_client=web"])
        self.req("POST", "/config", self.ext(), {"extra_args": ""})

    def test_config_valida_tipos(self):
        self.assertEqual(self.req("POST", "/config", self.ext(), {"default_quality": "999"})[0], 400)
        self.assertEqual(self.req("POST", "/config", self.ext(), {"fab_enabled": "sim"})[0], 400)
        self.assertEqual(self.req("POST", "/config", self.ext(), {"output_dir": "a\x00b"})[0], 400)

    def test_corpo_gigante_413(self):
        try:
            st, _, _ = self.req("POST", "/config", self.ext(), raw=json.dumps({"extra_args": "A" * (3 * 1024 * 1024)}))
            self.assertEqual(st, 413)
        except ConnectionError:
            pass                      # o servidor fechou a conexão antes de ler o corpo: também vale como recusa
        self.assertEqual(self.req("GET", "/config", self.ext())[2]["extra_args"], "")   # nada foi gravado

    # -- pastas ------------------------------------------------------------ #
    def test_open_folder_recusa_arquivo(self):
        f = self.www / "a.mp4"
        self.assertEqual(self.req("POST", "/open-folder", self.ext(), {"path": str(f)})[0], 500)

    # -- miniatura --------------------------------------------------------- #
    def test_thumb_recusa_esquema_nao_http(self):
        for u in ("file:///C:/Windows/win.ini", "ftp://x/y.mp4", "javascript:1", "concat:file.txt"):
            self.assertEqual(self.req("GET", "/thumb?url=" + u, self.ext())[0], 404, u)

    # -- downloads (precisam do yt-dlp) ------------------------------------ #
    def test_download_url_invalida(self):
        self.assertEqual(self.req("POST", "/download", self.ext(), {"url": "file:///etc/passwd"})[0], 400)
        self.assertEqual(self.req("POST", "/download", self.ext(), {"url": "--exec calc"})[0], 400)

    def test_download_ignora_extra_args_do_corpo(self):
        if not self.have_ytdlp:
            self.skipTest("yt-dlp ausente")
        proof = self.tmp / "proof.txt"
        st, _, js = self.req("POST", "/download", self.ext(), {
            "url": "http://127.0.0.1:%d/a.mp4" % self.fport,
            "extra_args": "--simulate --print-to-file PWNED %s" % proof.as_posix()})
        self.assertEqual(st, 200)
        self.wait_job(js["job_id"])
        self.assertFalse(proof.exists())

    def test_download_completo_e_duplicado(self):
        if not self.have_ytdlp:
            self.skipTest("yt-dlp ausente")
        url = "http://127.0.0.1:%d/a.mp4" % self.fport
        _, _, a = self.req("POST", "/download", self.ext(), {"url": url, "title": "teste"})
        _, _, b = self.req("POST", "/download", self.ext(), {"url": url, "title": "teste"})
        if not b.get("duplicate"):          # o 1º já pode ter terminado: tudo bem
            self.assertNotEqual(a["job_id"], b["job_id"])
        else:
            self.assertEqual(a["job_id"], b["job_id"])
        st = self.wait_job(a["job_id"])
        self.assertEqual(st["status"], "done", st)
        self.assertTrue(Path(st["file"]).exists())

    def test_cancelar_download(self):
        if not self.have_ytdlp:
            self.skipTest("yt-dlp ausente")
        _, _, js = self.req("POST", "/download", self.ext(), {"url": "http://127.0.0.1:%d/slow.mp4" % self.sport})
        for _ in range(40):                  # espera começar
            if self.req("GET", "/status?id=" + js["job_id"], self.ext())[2].get("status") == "downloading":
                break
            time.sleep(0.25)
        time.sleep(1.5)
        self.assertEqual(self.req("POST", "/cancel", self.ext(), {"id": js["job_id"]})[0], 200)
        st = self.wait_job(js["job_id"], 20)
        self.assertEqual(st["status"], "canceled", st)
        self.assertEqual(self.req("POST", "/cancel", self.ext(), {"id": js["job_id"]})[0], 404)   # já terminou

    # -- funções puras ----------------------------------------------------- #
    def test_clean_cookies(self):
        m = self.mod
        good = ".a.com\tTRUE\t/\tFALSE\t2000000000\tn\tv"
        txt = "# Netscape HTTP Cookie File\n%s\nlixo sem tabs\n#HttpOnly_.b.com\tTRUE\t/\tTRUE\t2000000000\tk\tv2\n" % good
        out = m.clean_cookies(txt)
        self.assertIn(good, out)
        self.assertIn("#HttpOnly_.b.com", out)
        self.assertNotIn("lixo", out)
        self.assertEqual(m.clean_cookies("qualquer coisa"), "")

    def test_health_informa_ffmpeg_de_verdade(self):
        js = self.req("GET", "/health", self.ext())[2]
        for k in ("ffmpeg_ok", "ffprobe_ok", "deno", "impersonate"):
            self.assertIn(k, js)

    def test_erros_em_portugues(self):
        m = self.mod
        self.assertIn("robô", m.friendly_error("Sign in to confirm you're not a bot"))
        self.assertIn("403", m.friendly_error("HTTP Error 403: Forbidden"))
        self.assertIn("FFmpeg", m.friendly_error("Postprocessing: ffprobe and ffmpeg not found."))
        self.assertEqual(m.friendly_error("erro qualquer"), "erro qualquer")

    def test_detecta_pedacos_nao_unidos(self):
        m = self.mod
        for nome in ("Titulo [abc].f251.webm", "Titulo [abc].f395.mp4", "x [id].fhls-1080.mp4"):
            self.assertTrue(m.UNMERGED_RE.search(nome), nome)
        for nome in ("Titulo [abc].mp4", "Aula 2.f final [abc].mp4"):
            self.assertFalse(m.UNMERGED_RE.search(nome), nome)

    def test_ffmpeg_ausente_vira_formato_unico_com_audio(self):
        # um "ffmpeg" que não executa não pode ser tratado como disponível
        self.assertTrue(self.mod.FF_MISSING_RE.search("ERROR: Postprocessing: ffprobe and ffmpeg not found. Please install"))
        self.assertTrue(self.mod.FF_MISSING_RE.search("WARNING: You have requested merging of multiple formats but ffmpeg is not installed. The formats won't be merged"))

    def test_clean_url(self):
        m = self.mod
        self.assertTrue(m.clean_url("https://a.com/x.m3u8?a=1"))
        for bad in ("", "javascript:1", "file:///x", "http://", "https://a.com/a b", "https://a.com/\nx", "--exec"):
            self.assertEqual(m.clean_url(bad), "", bad)


class SiteRulesCase(unittest.TestCase):
    """Regras por site do servidor (sem rede, sem subir o servidor): Vimeo, Instagram e pedaços de DASH."""

    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("nvf_server_rules", SERVER_SRC)
        cls.m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.m)

    def cmd(self, url):
        return self.m.build_cmd(url, "best", "out.%(ext)s", "", "", "", [], False, True, False)[0]

    def test_vimeo_page_vira_player_com_referer(self):
        self.assertEqual(self.m.normalize_target("https://vimeo.com/22439234", ""),
                         ("https://player.vimeo.com/video/22439234", "https://vimeo.com/"))
        self.assertEqual(self.m.normalize_target("https://vimeo.com/76979871/abcdef1234", "")[0],
                         "https://player.vimeo.com/video/76979871?h=abcdef1234")
        # o Referer de quem embute o player (Hotmart etc.) é preservado
        self.assertEqual(self.m.normalize_target("https://player.vimeo.com/video/1234567", "https://curso.example/aula")[1],
                         "https://curso.example/aula")
        self.assertEqual(self.m.normalize_target("https://example.com/v", "x"), ("https://example.com/v", "x"))

    def test_pedaco_de_dash_nao_serve_de_video(self):
        self.assertTrue(self.m.FRAGMENT_RE.search("/v2/drm/remux/avf/abc/segment.mp4?x=1"))
        self.assertFalse(self.m.FRAGMENT_RE.search("/videos/aula-1.mp4"))

    def test_post_do_instagram_baixa_todos_os_itens_do_carrossel(self):
        c = self.cmd("https://www.instagram.com/p/DfetRqgDAfA/")
        self.assertNotIn("--no-playlist", c)                 # carrossel = lista de itens
        self.assertNotIn("--playlist-items", c)              # não limita ao 1º
        self.assertIn("--ignore-errors", c)                  # foto não tem vídeo: pula e segue
        # fora do Instagram continua "um vídeo por pedido"
        c2 = self.cmd("https://example.com/watch")
        self.assertIn("--no-playlist", c2)
        self.assertIn("--playlist-items", c2)

    def test_pinterest_carrossel_story_e_nome(self):
        vl = lambda h: {"video_list": {
            "V_720P": {"url": "https://v1.pinimg.com/videos/iht/expMp4/aa/bb/cc/%s_720w.mp4" % h, "width": 720},
            "V_HLSV4": {"url": "https://v1.pinimg.com/videos/iht/hls/aa/bb/cc/%s.m3u8" % h, "width": 720}}}
        titulo, urls = self.m.pin_pick({"seo_title": "Cartaz 100% animado: v1 | Graphicdesign, Morph",
                                        "carousel_data": {"carousel_slots": [{"videos": vl("a" * 32)}, {"images": {}}, {"videos": vl("b" * 32)}]}})
        self.assertEqual(len(urls), 2)                                  # a foto do carrossel (sem vídeo) fica de fora
        self.assertTrue(all(u.endswith("_720w.mp4") for u in urls))     # MP4 de preferência ao HLS
        self.assertEqual(titulo, "Cartaz 100 animado v1")               # sem o que vem depois do "|" e sem caracteres proibidos no nome
        _, hls = self.m.pin_pick({"story_pin_data": {"pages": [{"blocks": [{"video": {"video_list": {
            "V_HLSV3_MOBILE": {"url": "https://v1.pinimg.com/videos/iht/hls/aa/bb/cc/%s.m3u8" % ("c" * 32)}}}}]}]}})
        self.assertEqual(len(hls), 1)
        self.assertTrue(hls[0].endswith(".m3u8"))                       # story pin só tem HLS
        self.assertEqual(self.m.pin_pick({"images": {}}), ("", []))     # pin só de foto: nada a baixar
        self.assertTrue(self.m.PIN_RE.match("https://br.pinterest.com/pin/1102537552566561894/"))
        self.assertFalse(self.m.PIN_RE.match("https://br.pinterest.com/ideas/motion/"))

    def test_atualizacao_pelo_github(self):
        import tempfile, zipfile
        m = self.m
        sha = "ab" * 32
        rel = lambda tag, **kw: dict({"tag_name": tag, "html_url": "https://github.com/noevfx/Extensions/releases/tag/" + tag,
            "assets": [{"name": "noevfx-downloader-%s.zip" % tag.lstrip("v"), "digest": "sha256:" + sha,
                        "browser_download_url": "https://github.com/noevfx/Extensions/releases/download/%s/noevfx-downloader-%s.zip" % (tag, tag.lstrip("v"))}]}, **kw)
        nova = "9.9.9"
        i = m.update_info(rel("v" + nova))
        self.assertTrue(i["newer"])
        self.assertEqual(i["sha256"], sha)
        self.assertFalse(i["can_apply"])                      # a pasta de desenvolvimento (tem .git/tools) nunca se atualiza sozinha
        self.assertIn("desenvolvimento", i["reason"])
        self.assertFalse(m.update_info(rel("v0.0.1"))["newer"])
        self.assertFalse(m.update_info(rel("v" + m.VERSION))["newer"])
        self.assertEqual(m.update_info({"tag_name": "lixo"})["reason"], "release sem versão válida")
        sem = rel("v" + nova); sem["assets"][0]["digest"] = ""
        self.assertEqual(m.update_info(sem)["sha256"], "")    # sem hash não há como conferir: não atualiza
        com_nota = dict(sem, body="SHA-256 do zip: `" + sha + "`")
        self.assertEqual(m.update_info(com_nota)["sha256"], sha)
        self.assertTrue(m._vtuple("3.0.10") > m._vtuple("3.0.9"))

        # troca de arquivos num "Target" falso: extension/ e server/server.py viram os do pacote, com cópia do que saiu
        with tempfile.TemporaryDirectory() as d:
            root = Path(d) / "inst"
            (root / "extension").mkdir(parents=True); (root / "server").mkdir()
            (root / "extension" / "manifest.json").write_text(json.dumps({"version": "1.0.0"}), encoding="utf-8")
            (root / "extension" / "velho.js").write_text("velho", encoding="utf-8")
            (root / "server" / "server.py").write_text('VERSION = "1.0.0"', encoding="utf-8")
            def pacote(nome, ver, vserver=None):
                zp = Path(d) / nome
                with zipfile.ZipFile(zp, "w") as z:
                    z.writestr("noevfx-downloader/windows/extension/manifest.json", json.dumps({"version": ver}))
                    z.writestr("noevfx-downloader/windows/extension/novo.js", "novo")
                    z.writestr("noevfx-downloader/windows/server/server.py", 'VERSION = "%s"' % (vserver or ver))
                    z.writestr("noevfx-downloader/mac/extension/manifest.json", "{}")
                return zp
            with self.assertRaises(RuntimeError):             # versão do servidor dentro do pacote diferente da anunciada
                m.update_apply_package(pacote("ruim.zip", "2.0.0", "3.0.0"), "2.0.0", root, "windows")
            self.assertEqual((root / "server" / "server.py").read_text(), 'VERSION = "1.0.0"')     # nada foi trocado
            res = m.update_apply_package(pacote("ok.zip", "2.0.0"), "2.0.0", root, "windows")
            self.assertEqual(json.loads((root / "extension" / "manifest.json").read_text())["version"], "2.0.0")
            self.assertEqual((root / "extension" / "novo.js").read_text(), "novo")
            self.assertEqual((root / "server" / "server.py").read_text(), 'VERSION = "2.0.0"')
            self.assertEqual(json.loads((Path(res["backup"]) / "extension" / "manifest.json").read_text())["version"], "1.0.0")
            self.assertTrue((Path(res["backup"]) / "server.py").exists())
            # segunda atualização na mesma versão antiga: outra pasta de backup (nunca sobrescreve)
            (root / "extension" / "manifest.json").write_text(json.dumps({"version": "1.0.0"}), encoding="utf-8")
            res2 = m.update_apply_package(pacote("ok2.zip", "2.0.0"), "2.0.0", root, "windows")
            self.assertNotEqual(res["backup"], res2["backup"])

    def test_tweet_baixa_todos_os_videos(self):
        for u in ("https://x.com/fulano/status/1234567890123456789", "https://twitter.com/fulano/status/1234567890123456789"):
            c = self.cmd(u)
            self.assertNotIn("--no-playlist", c)
            self.assertNotIn("--playlist-items", c)
            self.assertIn("--ignore-errors", c)
        self.assertIn("--no-playlist", self.cmd("https://x.com/home"))

    def test_faixa_de_bytes_nao_serve_de_plano_b(self):
        self.assertTrue(self.m.RANGE_URL_RE.search("https://vod.vimeocdn.com/x/v2/range/prot/cmFuZ2U9OTE0/avf/a.mp4?pathsig=1"))
        self.assertTrue(self.m.RANGE_URL_RE.search("https://scontent.cdninstagram.com/o1/v/x.mp4?bytestart=0&byteend=99"))
        self.assertFalse(self.m.RANGE_URL_RE.search("https://cdn.example/videos/aula.mp4"))

    def test_manifesto_com_drm_nao_serve_de_plano_b(self):
        self.assertTrue(self.m.DRM_URL_RE.search("https://vod.vimeocdn.com/x/v2/playlist/drm/cenc,derivedv2,abc/av/primary/playlist.mpd"))
        self.assertFalse(self.m.DRM_URL_RE.search("https://vod.vimeocdn.com/x/v2/playlist/av/primary/playlist.m3u8"))

    def test_url_de_midia_direta_usa_extrator_generico(self):
        c = self.cmd("https://live-01.edge.video.globo.com/j/abc/live/f(i=2)/gehd/playlist.m3u8")
        self.assertIn("--use-extractors", c)
        self.assertIn("generic", c)
        self.assertNotIn("--use-extractors", self.cmd("https://www.youtube.com/watch?v=abc"))


if __name__ == "__main__":
    unittest.main()
