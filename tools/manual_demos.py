"""Atualiza as demonstrações do manual a partir das interfaces do produto.
Não usa o app local: scripts de exemplo só simulam seleções e exibem mensagens.
"""
import re
import shutil
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/"docs/site/assets"

def main():
    for name in ("collection.js","collection.css"):
        shutil.copy2(ROOT/"browser"/name,ASSETS/name)
    batch=(ROOT/"browser/batch.html").read_text(encoding="utf-8")
    batch=re.sub(r'<script.*?</script>','',batch,flags=re.S)
    batch=batch.replace('</body>','<script src="collection.js"></script><script src="collection-demo.js"></script><script src="demo-size.js"></script></body>')
    batch=batch.replace('Você escolhe. O app organiza.','DEMONSTRAÇÃO · SEM DOWNLOADS')
    (ASSETS/"batch-demo.html").write_text(batch,encoding="utf-8")
    panel=(ROOT/"adobe/index.html").read_text(encoding="utf-8")
    panel=re.sub(r'<script.*?</script>','',panel,flags=re.S).replace('../browser/collection.css','collection.css')
    panel=panel.replace('<body>','<body data-adobe="true">').replace('Verificando o projeto…','Projeto de exemplo: Filme de marca · _Noe VFX Downloader').replace('App local: verificando…','DEMONSTRAÇÃO · Não inicia downloads ou importações')
    panel=panel.replace('</body>','<script src="collection.js"></script><script src="collection-demo.js"></script><script src="demo-size.js"></script></body>')
    (ASSETS/"adobe-demo.html").write_text(panel,encoding="utf-8")
    popup=(ROOT/"browser/popup.html").read_text(encoding="utf-8")
    popup=re.sub(r'<script.*?</script>','',popup,flags=re.S)
    popup=popup.replace('</head>', '<style>body{width:100%;max-width:388px;min-width:0}</style></head>')
    # A demonstração usa o mesmo dicionário, sempre em português.
    popup=popup.replace('</body>','<script src="i18n-demo.js"></script><script src="popup-demo.js"></script><script src="demo-size.js"></script></body>')
    shutil.copy2(ROOT/"browser/i18n.js",ASSETS/"i18n-demo.js")
    i18n=ASSETS/"i18n-demo.js"
    i18n.write_text(i18n.read_text(encoding="utf-8").replace('const LANG = detect();', 'const LANG = "pt";'),encoding="utf-8")
    (ASSETS/"popup-demo.html").write_text(popup,encoding="utf-8")
    # Mantém o contexto de página/player aprovado, mas substitui os controles pelo menu novo.
    video=(ASSETS/"video-demo.html").read_text(encoding="utf-8")
    video=re.sub(r'<label style="display:block;font-size:11px;color:#a4afc4;margin-bottom:8px">.*?</label>', '', video, flags=re.S)
    start=video.index('      <div class="grid">')
    end=video.index('      <div class="send-h">',start)
    video=video[:start]+'''      <label style="display:block;font-size:11px;color:#a4afc4;margin-bottom:8px">Qualidade do vídeo<select data-quality style="display:block;width:100%;padding:8px;margin-top:5px;border:1px solid #303747;border-radius:7px;background:#1b1f29;color:#f1f4fa;font:inherit"><option value="best">Nativa · Máxima disponível</option><option value="1080">1080p · Full HD</option><option value="720">720p · HD</option></select></label>
      <div class="grid"><button type="button" class="opt main" data-q="selected">Baixar na pasta padrão</button><button type="button" class="opt audio-choice" style="grid-column:1 / -1" data-audio>Escolher formato de áudio…</button></div>
'''+video[end:]
    video=video.replace('Baixar todos os vídeos desta página','Escolher vídeos desta página…')
    if 'data-playlist-demo' not in video:
        video=video.replace('<div class="all"><button', '<div class="all"><button type="button" class="all-btn" data-playlist-demo>Ver playlist deste vídeo…</button></div><div class="all"><button',1)
    video=re.sub(r'<script\b[^>]*>.*?</script>','',video,flags=re.S)
    video=video.replace('</body>','<script src="video-demo.js"></script><script src="demo-size.js"></script></body>')
    video=video.replace('.sample{height:470px;', '.sample{height:570px;')
    video=video.replace('.sample{height:478px}', '.sample{height:578px}')
    if '/* Menu na ilustração estreita */' not in video:
        video=video.replace('</style>', '/* Menu na ilustração estreita */@media(max-width:360px){.sample .panel{width:calc(100% - 16px)}}\n</style>')
    (ASSETS/"video-demo.html").write_text(video,encoding="utf-8")
    for name in ("video-demo.html", "popup-demo.html", "adobe-demo.html", "batch-demo.html"):
        path=ASSETS/name
        path.write_text("\n".join(line.rstrip() for line in path.read_text(encoding="utf-8").splitlines())+"\n",encoding="utf-8")

if __name__=="__main__":main()
