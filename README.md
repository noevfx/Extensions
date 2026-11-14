<p align="center"><img src="https://raw.githubusercontent.com/noevfx/noevfx-downloader/main/docs/site/assets/logo-noevfx-oficial.svg" width="110" alt="Noé VFX"></p>

<h1 align="center">Do vídeo ao seu projeto.</h1>
<p align="center"><b>Noe VFX Downloader · for Editors</b><br>Encontre uma referência no navegador. Envie para o Premiere ou After Effects.<br>Recebeu links do cliente? Cole a lista no painel e continue editando.</p>

<p align="center"><a href="https://noevfx.github.io/noevfx-downloader/"><b>Conheça o produto ↗</b></a>　·　<a href="https://noevfx.github.io/noevfx-downloader/instalar.html"><b>Instale e comece ↗</b></a>　·　<a href="https://github.com/noevfx/noevfx-downloader/blob/main/docs/MANUAL-DE-USO.md"><b>Manual completo ↗</b></a>　·　<a href="https://github.com/noevfx/noevfx-downloader/releases"><b>Downloads ↗</b></a></p>

**Para navegadores Chromium:** Chrome, Edge, Brave, Opera e Vivaldi. Painéis Adobe na edição **for Editors**, para Windows e macOS. A edição comum também funciona no Linux.

> **Versão:** o código e o manual já descrevem a 3.1.1 em validação. Confira a versão disponível em [Releases](https://github.com/noevfx/noevfx-downloader/releases). O repositório agora se chama `noevfx-downloader`; quem usava o endereço antigo deve instalar o pacote novo para migrar.

## Você encontra. O projeto recebe.

<table>
<tr><th>No navegador</th><th>No Premiere e no After Effects</th></tr>
<tr>
<td width="50%"><a href="https://noevfx.github.io/noevfx-downloader/navegador.html"><img src="https://raw.githubusercontent.com/noevfx/noevfx-downloader/main/docs/img/popup-editors-3.1.1.png" alt="Popup atual: Enviar para o projeto, botões Premiere e After Effects e Vários links"></a></td>
<td width="50%"><a href="https://noevfx.github.io/noevfx-downloader/manual.html"><img src="https://raw.githubusercontent.com/noevfx/noevfx-downloader/main/docs/img/painel-adobe-3.1.1.png" alt="Painel Adobe atual com uma lista de links, qualidade, Baixar e importar e resultado de cada vídeo"></a></td>
</tr>
<tr><td>Achou uma referência? Use <b>Enviar para o projeto</b>.</td><td>Recebeu uma lista? Cole os links e use <b>Baixar e importar</b>.</td></tr>
</table>

<sub>Renderizações das interfaces atuais, com dados de exemplo. Clique nas imagens para abrir o guia do fluxo correspondente.</sub>

### “Vi esse vídeo e quero usar como referência.”

1. Passe o mouse sobre o vídeo na página e abra o **botão azul do Downloader**.
2. Em **Enviar para o projeto**, escolha **Premiere** ou **After Effects**.
3. Acompanhe o download. O arquivo segue para a pasta do trabalho e é importado no projeto aberto.

O editor precisa estar aberto, com o projeto salvo e o componente Adobe instalado. A extensão cuida do caminho entre a pesquisa e o material de edição.

<details>
<summary><b>Veja o botão sobre o player e o menu de envio</b></summary>

<p align="center"><a href="https://noevfx.github.io/noevfx-downloader/manual.html#pelo-navegador"><img src="https://raw.githubusercontent.com/noevfx/noevfx-downloader/main/docs/img/video-envio-3.1.1.png" width="420" alt="Página web com player, botão do Downloader e menu com os destinos Premiere e After Effects"></a></p>

</details>

### “O cliente mandou vários links.”

Abra **Noe VFX for Editors** no Premiere ou After Effects. Cole um link por linha, escolha a qualidade e clique em **Baixar e importar**. O painel acompanha cada vídeo e organiza os arquivos na pasta/bin `_Noe VFX Downloader` do projeto.

[Veja o passo a passo com as interfaces →](https://noevfx.github.io/noevfx-downloader/manual.html#passos)

### “Quero baixar vários de uma vez.”

- **Vídeos da mesma página:** use **Baixar todos os vídeos desta página** para salvar os itens detectados na pasta de downloads.
- **Links de páginas diferentes:** abra **Vários links** no popup. Cole a lista e escolha qualidade e destino: uma pasta ou o projeto Adobe.

<details>
<summary><b>Veja os menus de qualidade e destino</b></summary>

![Vários links com qualidade e destino do projeto](https://raw.githubusercontent.com/noevfx/noevfx-downloader/main/docs/img/varios-links-3.1.1.png)

</details>

## Escolha sua edição

| | **Downloader** | **Downloader for Editors** |
|---|---|---|
| Salvar vídeos pelo navegador | Sim | Sim |
| Botão sobre o vídeo, popup e vários links | Sim | Sim |
| Enviar do navegador ao projeto Adobe | — | Sim |
| Colar links no painel do Premiere/After Effects | — | Sim |
| Preparar compatibilidade H.264 | — | Sim |
| Nome do pacote | `noevfx-downloader-basic-<versão>.zip` | `noevfx-downloader-<versão>.zip` |

As duas edições usam o aplicativo local. Instalar uma substitui a outra. A integração Adobe depende do suporte a CEP na versão do editor. [Escolha e instale →](https://noevfx.github.io/noevfx-downloader/instalar.html)

## Instale uma vez. Use no seu fluxo.

1. Baixe a edição desejada em [Releases](https://github.com/noevfx/noevfx-downloader/releases) e **extraia o ZIP inteiro**.
2. Abra o instalador da pasta do seu sistema: Windows, macOS ou Linux.
3. Siga o guia para carregar a pasta **extension instalada** no navegador.
4. Na edição for Editors, reinicie o editor e abra um projeto salvo.

**Windows:** `windows/INSTALAR_NOEVFX.bat` · **macOS:** `mac/INSTALAR-MAC.command` · **Linux:** `bash instalar-noevfx.sh`.

O instalador prepara as ferramentas e inicia o app local. Use a pasta instalada da extensão; carregar a cópia extraída do ZIP pode deixar o navegador numa versão antiga.

## Qualidade sem reconversão desnecessária

Escolha **Nativa**, **até 1080p**, **até 720p** ou **Só áudio** no navegador. No envio ao Adobe, o app pede compatibilidade H.264: se a plataforma já oferece esse formato na resolução escolhida, preserva o vídeo. Se precisar converter, o progresso informa a etapa e o processador/GPU usado.

[Entenda formatos, qualidade e GPU →](https://noevfx.github.io/noevfx-downloader/formatos.html)

## Precisa de ajuda?

**Offline?** Rode o instalador novamente. **Atualizou e a aba ficou antiga?** Dê F5. **Não apareceu no projeto?** Confira a mensagem de importação e a pasta do trabalho.

[Guia de solução de problemas](https://noevfx.github.io/noevfx-downloader/ajuda.html) · [Atualizar ou desinstalar](https://noevfx.github.io/noevfx-downloader/atualizar.html) · [Abrir uma issue](https://github.com/noevfx/noevfx-downloader/issues) · [labs@noevfx.com](mailto:labs@noevfx.com)

<details>
<summary><b>Compatibilidade, privacidade e limites</b></summary>

Vídeos públicos, players MP4/HLS/DASH e conteúdo acessível pela sua sessão podem ser baixados conforme a plataforma. Não contorna DRM ou controles de acesso. Testes simulados não garantem funcionamento em todo site; macOS/Linux e alguns cenários de hardware ainda dependem de validação física.

O processamento acontece no seu computador. Não há conta nem telemetria da Noé VFX. O app acessa a plataforma do vídeo e serviços de instalação/atualização. [Privacidade](https://github.com/noevfx/noevfx-downloader/blob/main/PRIVACY.md) · [Termos de uso](https://github.com/noevfx/noevfx-downloader/blob/main/TERMS.md) · [Licença](https://github.com/noevfx/noevfx-downloader/blob/main/LICENSE).

</details>

<details>
<summary><b>Para quem desenvolve</b></summary>

`browser/` contém a extensão Chromium; `adobe/`, os painéis CEP; `server/`, o app local; `installers/`, os instaladores; `docs/site/`, o site e o manual HTML. `tools/build.py` gera os dois ZIPs em `dist/`. A pasta instalada continua se chamando `extension/`.

Consulte [HANDOFF.md](https://github.com/noevfx/noevfx-downloader/blob/main/HANDOFF.md), [CHANGELOG.md](https://github.com/noevfx/noevfx-downloader/blob/main/CHANGELOG.md) e os testes em `tests/`.

</details>
