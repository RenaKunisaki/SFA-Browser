import { assertType, downloadXml, getXml, hex, int } from "../../Util.js";
import { E, clearElement } from "../../lib/Element.js";
import Game from "../../game/Game.js";
import Patcher from "../../game/Patcher.js";

/* procedure to apply a patch.xml:
- read the XML and build a map like:
  files: {
    textures: {
        123: {
            src: 'tex123.png',
            force: false,
        },
    }
  }
- for each map directory:
  - for each file:
    - split the file into {id:data} for each asset (keep them compressed)
    - for each entry in files.whatever:
      - if this entry is present:
        - replace the asset
      - elif the 'force' flag is set:
        - add the asset
    - concat the assets back together and build the table
- if the repack option is enabled:
  - for each map directory:
    - for each file:
      - split the file into array of assets
      - for each asset: unpack and repack
      - rebuild the file and table
- rebuild an ISO with the modified files
*/

export default class PatchManagerTab {
    /** The game patch manager UI.
     */
    constructor(game) {
        this.game = assertType(game, Game);
        this.app  = game.app;
        this.patches = {}; //id => patch

        this.element = document.getElementById('tab-patches');
        this.app.onIsoLoaded(iso => this._onIsoLoaded());

        //set up the button on file select to make it more obvious
        //how to apply a patch
        document.getElementById('openPatches').addEventListener('click', e => {
            this.app.ui.tabs.showTab('Patches');
        });
    }

    _onIsoLoaded() {
        this._makeUi();
        this._getPatches().then(() => {
            this._refreshPatchList();
            this.eApply.removeAttribute('disabled');
        });
    }

    _makeUi() {
        this.eSelect = E.select(null, {
            id:   'selectPatch',
            name: 'selectPatch',
        });
        this.eVersion = E.select(null, {
            id:   'patchVersion',
            name: 'patchVersion',
        });
        this.eDescription = E.div();
        this.eApply = E.button(null, "Apply Patch", {disabled:true});
        clearElement(this.element).append(
            E.div('box',
                E.h1(null, "Select Patch"),
                E.label(null, "Patch: ", {'for': 'selectPatch'}),
                this.eSelect,
                E.label(null, "Version: ", {'for': 'patchVersion'}),
                this.eVersion,
            ),
            E.div('box',
                E.h1(null, "Patch Info"),
                this.eDescription,
            ),
            E.div('box',
                E.h1(null, "Options"),
            ),
            E.div('box bigButton',
                this.eApply,
            ),
        );

        this.eSelect.addEventListener('change', e => {
            this._onPatchSelect(e.target.value);
        });
        this.eApply.addEventListener('click', async e => {
            await this._applyPatch();
        });
    }

    async _getPatches() {
        /** Download and parse the list of patches.
         *  @returns a dict of id => patch.
         */
        console.log("Downloading patches");
        this.app.progress.show({
            taskText: "Loading",
            subText: "Loading patch info...",
            numSteps: 1, stepsDone: 0,
        });
        const xml = await getXml(`./data/patches/index.xml`);
        console.log("Got patch info", xml);
        const lang = this.app.getBrowserLanguage().toLowerCase();

        const patches = xml.getElementsByTagName('patch');
        for(let ePatch of patches) {
            const id = ePatch.getAttribute('id');
            let description = "No description available.";
            let eDescription = ePatch.getElementsByTagName('description');
            if(eDescription) eDescription = eDescription[0];
            if(eDescription) description = eDescription.textContent;
            let patch = {
                id: id,
                name: this._getPatchName(ePatch, lang),
                description: description,
                versions: this._getPatchVersions(ePatch),
                path: `./data/patches/${id}`,
            };
            this.patches[id] = patch;
        }
        return this.patches;
    }

    _getPatchName(ePatch, lang) {
        /** Get the name that should be displayed for this patch
         *  in the given language.
         *  @param ePatch The patch element from the XML file.
         *  @param lang The language ID (RFC 3066).
         *  @returns The displayed name string.
         */
        const names  = ePatch.getElementsByTagName('name');
        let name     = null;
        let fallback = null;
        for(let eName of names) {
            let lng = eName.getAttribute('lang');
            if(lng == null) fallback = eName;
            else if(lng.toLowerCase() == lang) {
                name = eName;
                break;
            }
        }
        if(name == null) name = fallback;
        if(name == null) name = "???";
        else name = name.textContent;
        console.log(`Name for patch ${ePatch.getAttribute('id')} in lang ${lang} is: "${name}"`)
        return name;
    }

    _getPatchVersions(ePatch) {
        /** Get the patch versions.
         *  @param ePatch The patch element from the XML file.
         *  @returns List of versions in order they should be displayed.
         */
        let versions = [];
        for(let eVersion of ePatch.getElementsByTagName('version')) {
            let version = {
                id:   eVersion.getAttribute('id'),
                date: eVersion.getAttribute('date'),
                //...
            };
            versions.push(version);
        }
        return versions;
    }

    _refreshPatchList() {
        /** Update the patch selection widget. */
        clearElement(this.eSelect);
        let first = null;
        for(const patch of Object.values(this.patches)) {
            if(first == null) first = patch;
            this.eSelect.append(
                E.option(null, {value:patch.id}, patch.name),
            );
        }
        this._onPatchSelect(first.id);
    }

    _refreshVersionList(patch) {
        /** Update the patch version selection widget.
         *  @param patch The selected patch.
         */
        clearElement(this.eVersion);
        for(const version of patch.versions) {
            this.eVersion.append(
                E.option(null, {id:version.id}, version.id),
            );
        }
    }

    _onPatchSelect(id) {
        /** Called when the Patch list widget is changed.
         *  @param id The patch ID.
         */
        const patch = this.patches[id];
        this._refreshVersionList(patch);
        const elem = E.span();
        elem.innerHTML = patch.description;
        clearElement(this.eDescription).append(elem);
    }

    async _applyPatch() {
        /** Called when Apply Patch is clicked. */
        const selPatch = this.eSelect.value;
        const selVer   = this.eVersion.value;
        const patch    = this.patches[selPatch];
        const patcher  = new Patcher(this.game);
        const xml = await getXml(`${patch.path}/${selVer}/patch.xml`);
        patcher.loadPatch(`${patch.path}/${selVer}`, xml);
        await patcher.generateIso();
    }
}
