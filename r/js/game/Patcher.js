import Game from "./Game.js";
import { assertType } from "../Util.js";
import { Command } from "./text/Command.js";

export default class Patcher {
    /** The game patch manager.
     */
    constructor(game) {
        this.game = assertType(game, Game);
        this.app  = game.app;
        this.patch = {
            files:  [],
            assets: {
                anim:     {},
                animcurv: {},
                models:   {},
                textures: {},
            },
            gametext: {
                de: {}, //German
                en: {}, //English
                es: {}, //Spanish
                fr: {}, //French
                it: {}, //Italian
                jp: {}, //Japanese
            },
        };
    }

    async loadPatch(xml) {
        /** Parse a patch XML file.
         *  @param xml The XML file.
         */
        const ePatch = xml.getElementsByTagName('patch')[0];
        for(let elem of ePatch.childNodes) {
            console.log("patch elem", elem);
            switch(elem.tagName) {
                case null: case undefined: break; //skip text nodes
                case 'copy':
                    this.patch.files.push({
                        op:   'copy',
                        from: elem.getAttribute('from'),
                        to:   elem.getAttribute('to'),
                    });
                    break;
                case 'delta':
                    this.patch.files.push({
                        op:    'delta',
                        file:  elem.getAttribute('file'),
                        patch: elem.getAttribute('patch'),
                    });
                    break;
                case 'gametext':
                    this._readGameText(elem);
                    break;
                default:
                    this._readAssetElem(elem);
                    break;
            }
        }
        console.log("Parsed patch", this.patch);
    }

    _readGameText(eGametext) {
        /** Parse gametext element.
         *  @param eGametext The XML element.
         */
        const lang = eGametext.getAttribute('lang');
        for(let eText of eGametext.childNodes) {
            if(!eText.getAttribute) continue;
            let id = eText.getAttribute('id');
            let text = {
                id: id,
                alignH: eText.getAttribute('alignh'),
                alignV: eText.getAttribute('alignv'),
                window: eText.getAttribute('window'),
                phrases: [],
            };
            this.patch.gametext[lang][id] = text;

            for(let ePhrase of eText.getElementsByTagName('phrase')) {
                text.phrases.push(this._readGameTextPhrase(ePhrase));
            }
        }
    }

    _readGameTextPhrase(ePhrase) {
        /** Read one gametext phrase.
         *  @param ePhrase The phrase element.
         *  @returns The text string in game format.
         *  @note The returned string is binary and may contain
         *   embedded NULL characters and invalid UTF-8 codes.
         */
        let str = "";
        for(let elem of ePhrase.childNodes) {
            if(!elem.getAttribute) continue; //skip whitespace/comments
            if(elem.tagName == 'str') {
                str += elem.textContent;
            }
            else if(Command[elem.tagName]) {
                const cmd = Command[elem.tagName];
                str += String.fromCodePoint(cmd.chr);
                for(let param of cmd.params) {
                    str += String.fromCodePoint(parseInt(elem.getAttribute(param)));
                }
            }
            else {
                console.error("Invalid element in text", elem, ePhrase);
            }
        }
        return str;
    }

    _readAssetElem(elem) {
        /** Parse asset element.
         *  @param elem The XML element.
         */
        for(let child of elem.childNodes) {
            if(!child.getAttribute) continue;
            let id = child.getAttribute('id');
            let asset = {
                id: id,
                src: child.getAttribute('src'),
                force: child.getAttribute('force') == '1',
            }
            this.patch.assets[elem.tagName][id] = asset;
        }
    }
}
