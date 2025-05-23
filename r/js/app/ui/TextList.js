import { E, clearElement } from "../../lib/Element.js";
import { assertType, hex } from "../../Util.js";
import Table from "./Table.js";
import Game, { TEXT_LANGUAGES } from "../../game/Game.js";
import GameTextRenderer from "../../game/text/Renderer.js";

/** Displays all GameText definitions from XML.
 */
export default class TextList {
    constructor(game) {
        this.game    = assertType(game, Game);
        this.app     = game.app;
        this.element = document.getElementById('tab-textList');
        this.app.onIsoLoaded(iso => this.refresh());
        this.app.onLanguageChanged(lang => this.refresh());
        this.renderer = new GameTextRenderer(this.app);
    } //constructor

    refresh() {
        let tbl = this._makeTable();
        for(let text of Object.values(this.app.game.texts)) {
            tbl.add(this._makeRow(text));
        }
        const elem = E.div('textList', tbl.element);
        clearElement(this.element).append(elem);
    }

    _makeTable() {
        return new Table({title:"GameText", columns: [
            {displayName:"#", name:'id',   type:'hex', length:4},
            {displayName:"W", name:'window',type:'hex', length:2,
                title:"Window type"},
            {displayName:"H", name:'alignH', type:'int', title:"Align H"},
            {displayName:"V", name:'alignV', type:'int', title:"Align V"},
            {displayName:"Text", name:'phrases',  type:'string',
                makeElem: (phrases, td, row) => {
                    clearElement(td).append(this.renderer.render(row.text));
                    td.classList.add('gametext');
                    return td;
                },
            },
        ]});
    }

    _makeRow(text) {
        const row = {
            text:    text,
            id:      text.id,
            phrases: text.phrases,
            window:  text.window,
            alignH:  text.align[0],
            alignV:  text.align[1],
        };
        return row;
    }
}
