import { assertType, downloadXml, getXml, hex, int } from "../../Util.js";
import { E } from "../../lib/Element.js";
import GameBitsXmlBuilder from "../../game/GameBitsXmlBuilder.js";
import GameTextXmlBuilder from "../../game/text/XmlBuilder.js";
import MapsXmlBuilder from "../../game/map/MapsXmlBuilder.js";
import Game from "../../game/Game.js";

/*
<div>
    <label for="selectPatch">Patch: </label>
    <select id="selectPatch" name="selectPatch">
        <option id="amethyst">Amethyst Edition</option>
    </select>

    <label for="patchVersion">Version: </label>
    <select id="patchVersion" name="patchVersion">
        <option id="3.0.0">3.0.0</option>
    </select>
</div>
<div>
    <h2>Options</h2>
    <div class="option">
        <input type="checkbox" name="chkPack" id="chkPack" />
        <label for="chkPack">Repack files to improve load time
            (will take longer to generate ISO)
        </label>
    </div>
</div>
<div id="doPatchContainer">
    <button id="doPatch">Generate Patched ISO</button>
</div>
*/

export default class PatchManagerTab {
    /** The game patch manager.
     */
    constructor(game) {
        this.game = assertType(game, Game);
        this.app  = game.app;

        this.element = document.getElementById('tab-patches');
        this.app.onIsoLoaded(iso => this._onIsoLoaded());

        document.getElementById('openPatches').addEventListener('click', e => {
            this.app.ui.tabs.showTab('patches');
        });
    }
}
