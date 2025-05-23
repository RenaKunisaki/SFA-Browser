import { E } from "../lib/Element.js";
import { assertType, hex } from "../Util.js";
import BinaryFile from "../lib/BinaryFile.js";
import GameBit from "./GameBit.js";
import RomList from "./map/RomList.js";
import GameFile from "./GameFile.js";
import Game from "./Game.js";

const XML = 'http://www.w3.org/1999/xhtml';

/** Generates gamebits.xml. */
export default class GameBitsXmlBuilder {
    constructor(game) {
        this.game = assertType(game, Game);
        this.app  = game.app;
    }

    async build() {
        this.bitElems = [];
        await this.parseBitTable();
        await this.parseRomLists();
        return this.xml;
    }

    async parseBitTable() {
        const bitTable = this.game.iso.getFile('/BITTABLE.bin');
        this.app.progress.show({
            taskText: "Generating XML",
            subText:  "Parsing BITTABLE.bin...",
            numSteps: bitTable.size / 4, stepsDone: 0,
        });

        const data = new BinaryFile(bitTable.getData());
        const xml  = document.implementation.createDocument(XML, "gamebits");
        this.xml   = xml;
        for(let i=0; i<bitTable.size / 4; i++) {
            let bit       = this.game.bits[i];
            if(!bit) bit = new GameBit(this.app, null);
            const item    = data.readU32();
            bit.id        = i;
            bit.offset    = item >> 16;
            bit.size      = ((item >> 8) & 0x1F) + 1;
            const hasHint = ((item >> 13) & 1) != 0;
            bit.table     = (item >> 14) & 3;
            bit.hintId    = hasHint ? ((item & 0xFF) + 0xF4) : null;
            //delete existing objref elements
            bit.objRefs   = [];
            let elem      = bit.toXml();
            xml.documentElement.appendChild(elem);
            this.bitElems.push(elem);
            if(!(i % 100)) await this.app.progress.update({stepsDone:i});
        }
    }

    async parseRomLists() {
        //build file list
        await this.app.progress.update({
            taskText:  "Generating XML",
            subText:   "Getting romlist file list...",
            numSteps:  1, stepsDone: 0,
        });
        const files = [];
        for(let file of this.game.iso.files) {
            if(file.isDir) continue;
            if(!file.path.endsWith('.romlist.zlb')) continue;
            files.push(file);
        }

        //parse the files
        let iFile = 0;
        for(let file of files) {
            iFile++;
            await this.app.progress.update({
                taskText:  "Generating XML",
                subText:   `Parsing ${file.name}...`,
                numSteps:  files.length, stepsDone: iFile,
            });
            const mapName = file.name.split('.')[0];
            const gFile   = new GameFile(file);
            const romList = new RomList(this.game, gFile);
            for(let entry of romList.entries) {
                let params = entry.params;
                if(params == null) params = [];
                for(let [name, param] of Object.entries(params)) {
                    //what the FUCK
                    const type = param.param.param ? param.param.param.type : null;
                    const val  = param.value.value & 0x7FFF;
                    if((type == 'GameBit' || type == 'GameBit16'
                    || type == 'GameBit32') && (val != 0x7FFF) && (val != 0)) {
                        const objName = entry.object.name.trim();
                        const objId   = `0x${hex(entry.id,8)}`;
                        const field   = [mapName,objName,objId,name].join('.'); //for debug
                        //high bit indicates inverted value
                        let eBit = this.bitElems[val];
                        if(eBit) {
                            eBit.append(E.objref({
                                map:   mapName,
                                obj:   objName,
                                objid: objId,
                                param: name,
                            }));
                        }
                        else {
                            console.warn(`Invalid GameBit 0x${hex(param.value.value)} for ${field}`);
                        }
                    }
                }
            } //for entry
        } //for file
    } //parseRomLists
}
