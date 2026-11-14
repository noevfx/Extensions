"""Nomes públicos, escolha do pacote e hashes por produto."""
import hashlib
import importlib.util
import json
import shutil
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]

class DistributionCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix="nvf_names_")
        file = Path(cls.tmp.name) / "server.py"
        shutil.copy2(ROOT / "server/server.py", file)
        spec = importlib.util.spec_from_file_location("distribution_server", file)
        cls.server = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.server)

    @classmethod
    def tearDownClass(cls):
        cls.server.EXECUTOR.shutdown(wait=True)
        cls.tmp.cleanup()

    def release(self, digests=True):
        return {"tag_name":"v9.9.9", "assets":[
            {"name":name, "digest":"sha256:"+sha if digests else "", "browser_download_url":"https://github.com/noevfx/noevfx-downloader/releases/download/v9.9.9/"+name}
            for name,sha in (("NoeVFX-Downloader-9.9.9.zip","ab"*32),("NoeVFX-Downloader-for-Editors-9.9.9.zip","cd"*32))]}

    def test_update_selects_exact_product(self):
        for edition,name,sha in (("basic","NoeVFX-Downloader-9.9.9.zip","ab"*32),("editors","NoeVFX-Downloader-for-Editors-9.9.9.zip","cd"*32)):
            with self.subTest(product=name),patch.object(self.server,"installed_edition",return_value=edition),patch.object(self.server,"installed_layout",return_value=True):
                info=self.server.update_info(self.release())
                self.assertTrue(info["can_apply"],info)
                self.assertTrue(info["asset"].endswith("/"+name))
                self.assertEqual(info["sha256"],sha)

    def test_hash_in_notes_matches_filename_not_first_hash(self):
        release=self.release(False)
        release["body"]="cd"*32+"  NoeVFX-Downloader-for-Editors-9.9.9.zip\n"+"ab"*32+"  NoeVFX-Downloader-9.9.9.zip"
        for edition,sha in (("basic","ab"*32),("editors","cd"*32)):
            with self.subTest(edition=edition),patch.object(self.server,"installed_edition",return_value=edition),patch.object(self.server,"installed_layout",return_value=True):
                self.assertEqual(self.server.update_info(release)["sha256"],sha)
                self.assertTrue(self.server.update_info(release)["can_apply"])

    def test_unidentified_hash_is_not_used_for_two_products(self):
        release=self.release(False)
        release["body"]="SHA256: "+"ab"*32
        self.assertFalse(self.server.update_info(release)["can_apply"])

    def test_foreign_repository_not_accepted(self):
        release=self.release()
        for asset in release["assets"]:
            asset["browser_download_url"]=asset["browser_download_url"].replace("/noevfx/","/outro/")
        self.assertFalse(self.server.update_info(release)["can_apply"])

    def test_final_packages_identify_products_and_installers(self):
        version=json.loads((ROOT/"browser/manifest.json").read_text(encoding="utf-8"))["version"]
        for suffix,product in (("","Noe VFX Downloader"),("-for-Editors","Noe VFX Downloader for Editors")):
            file=ROOT/"dist"/("NoeVFX-Downloader%s-%s.zip"%(suffix,version))
            self.assertTrue(file.is_file(),"Gere os pacotes: "+file.name)
            with self.subTest(product=product),zipfile.ZipFile(file) as archive:
                self.assertIsNone(archive.testzip())
                for platform,installer in (("windows","INSTALAR_NOEVFX.bat"),("mac","instalar-noevfx.sh"),("linux","instalar-noevfx.sh")):
                    root="noevfx-downloader/"+platform+"/"
                    text=archive.read(root+installer).decode("utf-8")
                    self.assertIn(product+"  v"+version,text)
                    self.assertNotIn("v3.1.1",text)
                    self.assertIn(product,archive.read(root+"guia-extensao.html").decode("utf-8"))
                    locale=json.loads(archive.read(root+"extension/_locales/pt_BR/messages.json"))
                    self.assertEqual(locale["extName"]["message"],product)
                    self.assertIn("<title>"+product+"</title>",archive.read(root+"extension/popup.html").decode("utf-8"))
                    self.assertIn("<h1>"+product+"</h1>",archive.read(root+"extension/options.html").decode("utf-8"))
                self.assertIn(product,archive.read("noevfx-downloader/VERSION.txt").decode("utf-8"))

if __name__ == "__main__":
    unittest.main()
