// Noe VFX for Editors - lado do Premiere / After Effects (ExtendScript).
// Respostas em texto "estado|valor" (o ExtendScript antigo não tem JSON).

var NVF_BIN = "_Noe VFX Downloader";

function nvfApp() {
    return BridgeTalk.appName === "aftereffects" ? "aftereffects" : "premiere";
}

function nvfNorm(p) {
    return String(p || "").replace(/\\/g, "/").toLowerCase();
}

// projeto ATIVO: "ok|caminho", "unsaved|" (projeto novo, sem pasta) ou "none|" (sem projeto)
function nvfProject() {
    try {
        if (nvfApp() === "aftereffects") {
            if (!app.project) return "none|";
            if (!app.project.file) return "unsaved|";          // o AE sempre tem um projeto; sem arquivo = ainda não salvo
            return "ok|" + app.project.file.fsName;
        }
        if (!app.project || !app.project.path) return "none|";
        return "ok|" + app.project.path;
    } catch (e) {
        return "err|" + e;
    }
}

function nvfExisting(pathsStr) {
    var paths = String(pathsStr || "").split("\n"), good = [];
    for (var i = 0; i < paths.length; i++) {
        if (paths[i] && new File(paths[i]).exists) good.push(paths[i]);
    }
    return good;
}

// importa os arquivos no bin _Noe VFX Downloader do projeto certo.
// "ok|n" = importou | "wait|motivo" = projeto não está aberto agora (tenta de novo depois) | "err|motivo"
function nvfImport(pathsStr, projPath) {
    try {
        var good = nvfExisting(pathsStr);
        if (!good.length) return "err|arquivos não encontrados";

        if (nvfApp() === "aftereffects") {
            var proj = app.project;
            if (!proj || !proj.file) return "wait|sem projeto salvo aberto";
            if (projPath && nvfNorm(proj.file.fsName) !== nvfNorm(projPath)) return "wait|outro projeto aberto";
            var folder = null;
            for (var i = 1; i <= proj.numItems; i++) {
                var it = proj.item(i);
                if (it instanceof FolderItem && it.name === NVF_BIN && it.parentFolder === proj.rootFolder) { folder = it; break; }
            }
            app.beginUndoGroup("Noe VFX: importar vídeos");
            if (!folder) folder = proj.items.addFolder(NVF_BIN);
            var n = 0;
            for (var k = 0; k < good.length; k++) {
                var item = proj.importFile(new ImportOptions(new File(good[k])));
                if (item) { item.parentFolder = folder; n++; }
            }
            app.endUndoGroup();
            return "ok|" + n;
        }

        // Premiere: pode haver vários projetos abertos -> o do caminho que o download usou
        var target = null;
        if (projPath) {
            for (var j = 0; j < app.projects.numProjects; j++) {
                if (nvfNorm(app.projects[j].path) === nvfNorm(projPath)) { target = app.projects[j]; break; }
            }
            if (!target) return "wait|projeto não está aberto";
        } else {
            target = app.project;
        }
        if (!target) return "wait|sem projeto aberto";
        var root = target.rootItem, bin = null;
        for (var c = 0; c < root.children.numItems; c++) {
            var ch = root.children[c];
            if (ch.type === ProjectItemType.BIN && ch.name === NVF_BIN) { bin = ch; break; }
        }
        if (!bin) bin = root.createBin(NVF_BIN);
        target.importFiles(good, true, bin, false);
        return "ok|" + good.length;
    } catch (e) {
        return "err|" + e;
    }
}
