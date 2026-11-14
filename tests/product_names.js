"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"../browser/i18n.js"),"utf8");
for(const edition of ["basic","editors"]){
  const context=vm.createContext({NVF_EDITION:edition,chrome:{i18n:{getUILanguage:()=>"pt-BR"}},navigator:{language:"pt-BR"}});
  vm.runInContext(source,context);
  const name=edition==="basic"?"Noe VFX Downloader":"Noe VFX Downloader for Editors";
  for(const key of ["optTitle","aboutTitle","staleTab","menuBest"]){
    const text=context.__nvfI18n.t(key);
    assert.ok(text.includes(name),key+": "+text);
    if(edition==="basic")assert.ok(!text.includes("for Editors"));
    assert.ok(!text.includes("for Editors for Editors"));
  }
}
console.log("Nomes dos dois produtos nas configurações, Sobre e menus: OK");
