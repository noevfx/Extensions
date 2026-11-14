"""Coleções e áudio: validação, fila independente da UI e entrega real dos cinco formatos."""
import importlib.util
import json
import shutil
import tempfile
import threading
import time
import unittest
import http.client
from contextlib import contextmanager
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


class CollectionsCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix="nvf_collections_")
        cls.folder = Path(cls.tmp.name)
        src = cls.folder / "server.py"
        shutil.copy2(ROOT / "server/server.py", src)
        spec = importlib.util.spec_from_file_location("collections_server", src)
        cls.m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.m)

    @classmethod
    def tearDownClass(cls):
        cls.m.EXECUTOR.shutdown(wait=True)
        cls.tmp.cleanup()

    def setUp(self):
        self.m.JOBS.clear()
        self.m.BATCHES.clear()

    @contextmanager
    def http_server(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), self.m.Handler)
        with patch.object(self.m, "PORT", server.server_port):
            threading.Thread(target=server.serve_forever, daemon=True).start()
            try:
                yield server.server_port
            finally:
                server.shutdown()
                server.server_close()

    def request(self, port, method, path, body=None, authorized=True):
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
        headers = {"Content-Type":"application/json"}
        if authorized:
            headers["Origin"] = "chrome-extension://hdmfifeopbmjcfjbjpkfjinejneohlji"
        connection.request(method, path, json.dumps(body) if body is not None else None, headers)
        response = connection.getresponse()
        result = response.status, json.loads(response.read())
        connection.close()
        return result

    def test_http_collection_routes_require_extension(self):
        with self.http_server() as port:
            for route in ("/inspect", "/batch", "/batch/cancel"):
                self.assertEqual(self.request(port,"POST",route,{},False)[0],403)
            self.assertEqual(self.request(port,"GET","/batch?id=unknown",authorized=False)[0],403)

    def test_http_inspect_and_invalid_manifest(self):
        with self.http_server() as port:
            self.assertEqual(self.request(port,"POST","/inspect",{"url":"https://example.org/master.m3u8"})[0],400)
            with patch.object(self.m,"inspect_collection",return_value={"title":"Lista","items":[{"url":"https://example.org/a","available":True}]}):
                status,data=self.request(port,"POST","/inspect",{"url":"https://example.org/playlist/a"})
                self.assertEqual(status,200);self.assertEqual(data["title"],"Lista")

    def test_http_batch_create_status_cancel_and_invalid_format(self):
        with self.http_server() as port, patch.object(self.m.EXECUTOR,"submit"):
            status,data=self.request(port,"POST","/batch",{"items":[{"url":"https://example.org/a"}],"quality":"audio","audio_format":"mp3"})
            self.assertEqual(status,200)
            bid=data["batch_id"]
            status,data=self.request(port,"GET","/batch?id="+bid)
            self.assertEqual(status,200);self.assertEqual(len(data["items"]),1)
            self.assertEqual(self.request(port,"POST","/batch/cancel",{"id":bid})[0],200)
            self.assertEqual(self.request(port,"POST","/batch",{"items":[{"url":"https://example.org/b"}],"audio_format":"invalid"})[0],400)
            deadline=time.time()+3
            while not self.m.BATCHES[bid].get("finished") and time.time()<deadline:time.sleep(.1)
            self.assertTrue(self.m.BATCHES[bid].get("finished"))

    def test_completed_result_survives_job_pruning(self):
        self.m.JOBS["job"]={"status":"done","file":"example.mp3"}
        self.m.BATCHES["batch"]={"items":[{"job_id":"job","url":"https://example.org/a"}],"canceled":False}
        self.m.batch_snapshot("batch")
        self.m.JOBS.clear()
        self.assertEqual(self.m.batch_snapshot("batch")["items"][0]["status"],"done")
        # Mesmo sem nenhuma consulta da interface, o despachante preserva os resultados.
        count=[]
        def quick_job(req):
            count.append(req)
            self.m.JOBS.clear()  # simula poda do histórico enquanto a interface está fechada
            jid="cached_"+str(len(count))
            self.m.JOBS[jid]={"status":"done","file":"example.mp3"}
            return jid,False
        with patch.object(self.m,"new_job",side_effect=quick_job):
            bid=self.m.create_batch({"items":[{"url":"https://example.org/"+str(i)} for i in range(3)]})
            deadline=time.time()+4
            while not self.m.BATCHES[bid].get("finished") and time.time()<deadline:time.sleep(.1)
            self.assertTrue(all(it["status"]=="done" for it in self.m.batch_snapshot(bid)["items"]))

    def test_full_global_queue_retries_instead_of_discarding(self):
        calls=[]
        def submit(req):
            calls.append(req)
            if len(calls)<3:raise self.m.QueueFull()
            self.m.JOBS["retry"]={"status":"done"}
            return "retry",False
        with patch.object(self.m,"new_job",side_effect=submit),patch.object(self.m,"load_cfg",return_value={"output_dir":str(self.folder),"organize_by_site":True}):
            bid=self.m.create_batch({"items":[{"url":"https://example.org/a"}]})
            deadline=time.time()+4
            while not self.m.BATCHES[bid].get("finished") and time.time()<deadline:time.sleep(.1)
            self.assertTrue(self.m.BATCHES[bid].get("finished"))
            self.assertEqual(len(calls),3)
            self.assertEqual(calls[-1]["project_dir"],str(self.folder/"example.org"))

    def test_private_removed_null_and_valid_entries(self):
        r = self.m.collection_entries({"entries": [None, {"url":"https://youtu.be/abc", "title":"[Private video]"},
            {"id":"NxYEzbbpk-4", "title":"Público"}], "extractor":"youtube:tab"},"https://www.youtube.com/playlist?list=abc")
        self.assertEqual([it["available"] for it in r["items"]], [False, False, True])
        self.assertEqual(r["items"][2]["url"], "https://www.youtube.com/watch?v=NxYEzbbpk-4")

    def test_collection_limit_is_explicit(self):
        r = self.m.collection_entries({"entries":[{"url":"https://example.org/a"}]*501},"https://example.org/playlist/a")
        self.assertTrue(r["truncated"])
        self.assertEqual(len(r["items"]),500)

    def test_manifest_is_not_collection(self):
        with self.assertRaises(ValueError):
            self.m.inspect_collection({"url":"https://example.org/playlist.m3u8"})

    def test_no_entries_is_not_silently_single_video(self):
        with self.assertRaises(ValueError):
            self.m.collection_entries({"title":"Um vídeo"},"https://example.org/video")

    def test_old_audio_client_keeps_m4a(self):
        r = self.m.prepare_download({"url":"https://example.org/video", "quality":"audio"})
        self.assertEqual(r["audio_format"],"m4a")

    def test_all_adobe_audio_formats_reach_import_queue(self):
        for fmt in ("mp3","m4a","wav"):
            path=self.folder/("import-test."+fmt)
            path.write_bytes(b"fixture")
            jid="import_"+fmt
            self.m.JOBS[jid]={"id":jid,"status":"done","all_files":[str(path)],"import_app":"premiere","project":"example.prproj","finished":time.time()}
        imports=self.m.pending_imports("premiere")
        self.assertEqual(len(imports),3)
        self.assertEqual({Path(it["files"][0]).suffix for it in imports},{".mp3",".m4a",".wav"})

    def test_reject_unknown_audio_format(self):
        for key,value in (("audio_format","--exec"),("audio_format",["mp3"]),("quality",["best"]),("target",["premiere"]),("target","unknown")):
            with self.subTest(key=key,value=value),self.assertRaises(ValueError):
                self.m.prepare_download(dict({"url":"https://example.org/video"},**{key:value}))

    def test_audio_adobe_supported_formats_only(self):
        for target in ("premiere","aftereffects"):
            for fmt in ("opus","flac"):
                with self.subTest(target=target,fmt=fmt), self.assertRaises(ValueError):
                    self.m.prepare_download({"url":"https://example.org/video", "quality":"audio", "target":target,"audio_format":fmt})

    def test_different_audio_format_and_folder_are_different_jobs(self):
        with patch.object(self.m.EXECUTOR,"submit"):
            a=self.m.new_job({"url":"https://example.org/video","quality":"audio","audio_format":"mp3"})
            b=self.m.new_job({"url":"https://example.org/video","quality":"audio","audio_format":"m4a"})
            c=self.m.new_job({"url":"https://example.org/video","quality":"audio","audio_format":"mp3","project_dir":str(self.folder/"other")})
            d=self.m.new_job({"url":"https://example.org/video","quality":"audio","audio_format":"mp3"})
        self.assertEqual(len({a[0],b[0],c[0]}),3)
        self.assertEqual(a[0],d[0]);self.assertTrue(d[1])

    def test_batch_rejects_bad_entries_and_oversize(self):
        for items in ([],[None],[{"url":"file:///bad"}],[{"url":"https://example.org/a"}]*501):
            with self.subTest(items=len(items)),self.assertRaises(ValueError):
                self.m.create_batch({"items":items})

    def test_pending_items_wait_and_cancel_without_disappearing(self):
        with patch.object(self.m.EXECUTOR,"submit"):
            bid=self.m.create_batch({"items":[{"url":"https://example.org/"+str(i)} for i in range(12)]})
            deadline=time.time()+7
            while len(self.m.JOBS)<8 and time.time()<deadline: time.sleep(.1)
            snap=self.m.batch_snapshot(bid)
            self.assertEqual(sum(it["status"]=="queued" for it in snap["items"]),8)
            self.assertEqual(sum(it["status"]=="pending" for it in snap["items"]),4)
            with self.m.BATCH_LOCK:
                self.m.BATCHES[bid]["canceled"]=True
                for jid in list(self.m.JOBS): self.m.cancel_job(jid)
            time.sleep(.7)
            snap=self.m.batch_snapshot(bid)
            self.assertTrue(snap["finished"])
            self.assertTrue(all(it["status"]=="canceled" for it in snap["items"]))

    def test_audio_without_ffmpeg_errors_instead_of_wrong_format(self):
        self.m.JOBS["missingff"] = {"id":"missingff", "status":"queued"}
        with patch.object(self.m,"ffmpeg_state",return_value={"ok":False}),patch.object(self.m,"supports_impersonate",return_value=False):
            self.m.run_job("missingff",{"url":"https://example.org/video","quality":"audio","audio_format":"mp3","project_dir":str(self.folder/"missing")})
        self.assertIn("FFmpeg",self.m.JOBS["missingff"]["error"])

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe") and shutil.which("yt-dlp"),"Requer ferramentas de mídia")
    def test_real_audio_download_in_all_five_formats(self):
        import subprocess
        media=self.folder/"media";media.mkdir(exist_ok=True)
        subprocess.run(["ffmpeg","-y","-v","error","-f","lavfi","-i","sine=frequency=440:duration=1",str(media/"tone.wav")],check=True,capture_output=True)
        class Handler(SimpleHTTPRequestHandler):
            def log_message(self,*args): pass
        http=ThreadingHTTPServer(("127.0.0.1",0),lambda *a,**k:Handler(*a,directory=str(media),**k))
        threading.Thread(target=http.serve_forever,daemon=True).start()
        try:
            for fmt,codec in [("mp3","mp3"),("m4a","aac"),("wav","pcm_s16le"),("flac","flac"),("opus","opus")]:
                with self.subTest(fmt=fmt),patch.object(self.m,"supports_impersonate",return_value=False):
                    jid="real_"+fmt
                    self.m.JOBS[jid] = {"id":jid,"status":"queued"}
                    self.m.run_job(jid,{"url":"http://127.0.0.1:%d/tone.wav"%http.server_port,"quality":"audio","audio_format":fmt,"project_dir":str(self.folder/fmt)})
                    job=self.m.JOBS[jid]
                    self.assertEqual(job["status"],"done",job.get("error"))
                    self.assertEqual(Path(job["file"]).suffix,"."+fmt)
                    output=subprocess.check_output(["ffprobe","-v","error","-show_entries","stream=codec_name","-of","json",job["file"]])
                    self.assertEqual(json.loads(output)["streams"][0]["codec_name"],codec)
        finally:
            http.shutdown();http.server_close()
