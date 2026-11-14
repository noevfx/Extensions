"""Ensaio isolado: atualizador anterior + ZIP novo, sem alterar instalação do usuário.
Uso: python tools/verify_update.py caminho/para/server-anterior.py
"""
import hashlib
import importlib.util
import json
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path
from unittest.mock import patch
from build import EDITIONS

ROOT=Path(__file__).resolve().parents[1]

def main():
    previous=Path(sys.argv[1])
    version=json.loads((ROOT/'browser/manifest.json').read_text(encoding='utf-8'))['version']
    for edition in ('editors','basic'):
        package=ROOT/'dist'/(EDITIONS[edition]['zip']%version)
        with tempfile.TemporaryDirectory(prefix='nvf_update_verify_') as temp:
            root=Path(temp)
            (root/'server').mkdir();(root/'extension').mkdir()
            shutil.copy2(previous,root/'server/server.py')
            cfg=b'{"output_dir":"D:/Teste/Minha pasta","onboarded":true}'
            (root/'server/config.json').write_bytes(cfg)
            (root/'extension/manifest.json').write_text('{"version":"3.1.0"}',encoding='utf-8')
            (root/'extension/edition.js').write_text('globalThis.NVF_EDITION = "%s";'%edition,encoding='utf-8')
            spec=importlib.util.spec_from_file_location('old_updater_'+edition,root/'server/server.py')
            old=importlib.util.module_from_spec(spec);spec.loader.exec_module(old)
            try:
                digest=hashlib.sha256(package.read_bytes()).hexdigest()
                legacy=tuple(map(int,old.VERSION.split('.'))) < (3,2,0)
                advertised=version if legacy else '9.9.9'
                name=EDITIONS[edition]['zip']%advertised
                asset={'name':name,'digest':'sha256:'+digest,'browser_download_url':'https://github.com/noevfx/noevfx-downloader/releases/download/v%s/%s'%(advertised,name)}
                info=old.update_info({'tag_name':'v'+advertised,'assets':[asset]})
                assert info['can_apply'] is (not legacy),info
                installer=old.install_panel_files
                with patch.object(old,'install_panel_files',side_effect=lambda files:installer(files,base=root/'panel')):
                    result=old.update_apply_package(package,version,root,'windows')
                assert (root/'server/config.json').read_bytes()==cfg
                assert (root/'extension/collection.js').exists()
                assert json.loads((root/'extension/manifest.json').read_text(encoding='utf-8'))['version']==version
                assert ('"'+edition+'"') in (root/'extension/edition.js').read_text(encoding='utf-8')
                if edition=='editors':
                    assert result['panel'] is True,result
                    assert (root/'panel/collection.js').read_bytes()==(root/'extension/collection.js').read_bytes()
                    assert '../browser/' not in (root/'panel/index.html').read_text(encoding='utf-8')
                else:assert not (root/'panel').exists()
                assert Path(result['backup']).is_dir()
                print('%s / %s: %s; estrutura do pacote, config e painel conferidos'%(old.VERSION,EDITIONS[edition]['name'],'migracao pelo instalador necessaria' if legacy else 'atualizador reconhece o padrao novo'))
            finally:old.EXECUTOR.shutdown(wait=True)

if __name__=='__main__':main()
