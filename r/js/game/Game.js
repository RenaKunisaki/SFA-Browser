import { assertType, downloadXml, getXml, int, hex } from "../Util.js";
import GameBit from "./GameBit.js";
import GameObject from "./GameObject.js";
import DLL from "./DLL.js";
import { MapParser } from "./map/MapParser.js";
import Text from "./text/Text.js";
import parseWarpTab from "./Warptab.js";
import App from "../app/App.js";
import { ISO } from "../types/iso/iso.js";
import GameFile from "./GameFile.js";
import SfaTexture from "./SfaTexture.js";
import Model from "./model/Model.js";

export const MAP_CELL_SIZE = 640;

//these names aren't localized because they're the names of
//the actual directories in the game disc.
export const TEXT_LANGUAGES = ['English', 'French',
    'German', 'Italian', 'Japanese', 'Spanish'];

export default class Game {
    /** Info and methods relating to the game itself.
     */
    constructor(app) {
        this.app         = assertType(app, App);
        this.version     = null;
        this.iso         = null;
        this.ram         = null;
        this.addresses   = {}; //name => {address, count}
        this.bits        = null; //GameBits
        this.objects     = null;
        this.objIndex    = null; //maps obj defNo to obj index
        this.objCats     = null; //object categories
        this.dlls        = null;
        this.maps        = null;
        this.mapDirs     = null; //id => name
        this.mapsByDirId = {};
        this.warpTab     = null;
        this.texts       = null;
        this.loadedTextures = {}; //ID => Texture
        this.loadedModels   = {}; //ID => Model
        this.texTable    = null;
        this.texPreTab   = null;
        this.texPreBin   = null;
        this.fileNames   = null; //id => name

        this.charNames = ["Krystal", "Fox"];

        this.setVersion('U0');
        this.app.onLanguageChanged(lang => this._loadTexts(lang));
    }

    async loadIso(iso) {
        this.iso = assertType(iso, ISO);

        let version;
        switch(this.iso.bootBin.gameCode) {
            case 'GSAE': version = 'U'; break;
            case 'GSAP': version = 'E'; break;
            case 'GSAJ': {
                if(this.iso.bootBin.gameName == '08 2002.05.17 E3_2002_StarFox')
                    version = 'K';
                else version = 'J';
                break;
            }
            default: {
                console.warn("Unrecognized game ID:", this.iso.bootBin.gameCode);
                version = '?';
            }
        }
        version += this.iso.bootBin.version.toString();
        console.log("Game version:", version);
        await this.setVersion(version);
    }

    async setVersion(version) {
        this.version  = version;
        this.bits     = null; //force redownload
        //this._verInfo = VERSION_INFO[this.version];

        //get addresses
        await this.app.progress.update({subText:"Downloading addresses.xml..."});
        const addrsXml = await getXml(`data/${this.version}/addresses.xml`);
        if(addrsXml) {
            for(let elem of addrsXml.getElementsByTagName('address')) {
                this.addresses[elem.getAttribute('name')] = {
                    address: int(elem.getAttribute('address')),
                    type:    elem.getAttribute('type'),
                    count:   int(elem.getAttribute('count')),
                };
            }
        }

        await this._loadTexts(this.app.language);
        //await this.getBits();

        //get object categories
        this.objCats = {};
        await this.app.progress.update({subText:"Downloading objcats.xml..."});
        const objCatsXml = await getXml(`data/${version}/objcats.xml`);
        if(objCatsXml) {
            for(let elem of objCatsXml.getElementsByTagName('cat')) {
                this.objCats[parseInt(elem.getAttribute('id'))] =
                    elem.getAttribute('name');
            }
        }

        if(this.iso) {
            await this._loadDlls();
            await this._loadObjects();
            this.warpTab = parseWarpTab(this);
            await this._loadMaps();
        }
    }

    async getBits() {
        if(!this.bits) {
            await this.app.progress.update({subText:"Downloading gamebits.xml..."});
            this.bits = await this.app._getXml(GameBit,
                this.version, 'gamebits', 'bit');
            this.app.progress.hide();
        }
        return this.bits;
    }

    getFileName(id) {
        /** Get name of asset file by ID. */
        this._loadFileNames();
        if(this.fileNames == null) return null;
        return this.fileNames[id];
    }

    openMapFile(mapId, fileId) {
        /** Open an asset file by ID. */
        this._loadFileNames();
        if(this.fileNames == null) return null;
        const fileName = this.fileNames[fileId];
        let name;
        if(mapId == -1) {
            name = `/${fileName}`;
        }
        else {
            if(fileName == 'BLOCKS.bin' || fileName == 'BLOCKS.tab') {
                //XXX
                return null;
            }
            const mapName = this.getMapDirName(mapId);
            name = `/${mapName}/${fileName}`;
        }
        try {
            return new GameFile(this.iso.getFile(name));
        }
        catch(ex) {
            //debugger;
            return null;
        }
    }

    getMapAt(layer, x, z) {
        /** Get map by coordinates.
         *  Accepts raw coords (not divided by cell size).
         */
        if(!this.mapGrid) throw new Error("Maps not loaded yet");
        let res = this.mapGrid[layer];
        if(res) res = res[Math.floor(x / MAP_CELL_SIZE)];
        if(res) res = res[Math.floor(z / MAP_CELL_SIZE)];
        if(res) res = res.map;
        return res;
    }

    getMapDirName(id) {
        if(!this.mapDirs) return "";
        if(id == -1) return "";
        if(this.mapDirs[id] != undefined) return this.mapDirs[id];
        return `0x${hex(id,2)}`;
    }

    getObject(defNo) {
        let obj = null;
        //this is the same logic the game uses
        if(defNo < 0) obj = this.objects[-defNo];
        else obj = this.objects[this.objIndex[defNo]];
        return obj;
    }

    loadTexture(id, dir) {
        if(this.loadedTextures[id]) return this.loadedTextures[id];

        //ensure the global texture files are loaded
        if(this.texTable == null) {
            this.texTable    = new GameFile(this.iso.getFile('/TEXTABLE.bin'));
            this.texPreTab   = new GameFile(this.iso.getFile('/TEXPRE.tab'));
            this.texPreBin   = new GameFile(this.iso.getFile('/TEXPRE.bin'));
        }

        //load the texture files for the given directory
        let   fTab0  = this.iso.getFile(`${dir}/TEX0.tab`);
        let   fBin0  = this.iso.getFile(`${dir}/TEX0.bin`);
        let   fTab1  = this.iso.getFile(`${dir}/TEX1.tab`);
        let   fBin1  = this.iso.getFile(`${dir}/TEX1.bin`);
        if(!fTab0) {
            console.error("Texture files not found in", dir);
            return null;
        }
        fTab0 = new GameFile(fTab0);
        fBin0 = new GameFile(fBin0);
        fTab1 = new GameFile(fTab1);
        fBin1 = new GameFile(fBin1);
        const bins = [fBin0, fBin1, this.texPreBin];
        const tabs = [fTab0, fTab1, this.texPreTab];

        //translate the ID
        const origId = id;
        if(id < 0) id = -id;
        else {
            this.texTable.seek(id*2);
            const newId = this.texTable.readU16();
            console.log(`texId 0x${hex(id,4)} => 0x${hex(newId,4)}`)
            id = newId + (((id < 3000) || (newId == 0)) ? 0 : 1);
        }
        let tblIdx = 0;
        if     (id & 0x8000) { tblIdx = 1; id &= 0x7FFF; }
        else if(id >=  3000) { tblIdx = 2; }

        //find the texture
        const fBin=bins[tblIdx], fTab=tabs[tblIdx];
        fTab.seek(id*4);
        let texOffs = fTab.readU32();
        //console.log(`Load texture ${id} from offs 0x${hex(texOffs,8)} tbl ${tblIdx}`);

        //load the texture
        //XXX investigate high byte of tab, something to do with mipmaps
        //and/or animation frames
        let unkCount = ((texOffs >> 24) & 0x3F);
        if(unkCount == 1) unkCount = 0;
        else unkCount += 1;
        texOffs = (texOffs & 0xFFFFFF) * 2;
        const data = fBin.decompress(texOffs + (unkCount*4));
        console.log(`texId=0x${hex(id)} tbl=${tblIdx} texOffs=0x${hex(texOffs,6)} unkCount=${unkCount}`, data);

        const texView = new DataView(data);
        const tex = SfaTexture.fromData(this, texView);
        tex.id = origId;
        tex.offset = texOffs;
        tex.tblIdx = tblIdx;

        this.loadedTextures[origId] = tex;
        return tex;
    }

    unloadTextures() {
        this.loadedTextures = {};
    }

    loadModel(gx, id, dir) {
        if(this.loadedModels[id]) return this.loadedModels[id];
        let mTab = this.iso.getFile(`${dir}/MODELS.tab`);
        let mBin = this.iso.getFile(`${dir}/MODELS.bin`);
        let mInd = this.iso.getFile(`${dir}/MODELIND.bin`);
        if(!mTab) {
            console.error("Model files not found in", dir);
            return null;
        }
        mTab = new GameFile(mTab);
        mBin = new GameFile(mBin);
        mInd = new GameFile(mInd);

        //translate the ID
        const origId = id;
        if(id < 0) id = -id;
        else {
            mInd.seek(id*2);
            const newId = mInd.readU16();
            console.log(`modelId 0x${hex(id,4)} => 0x${hex(newId,4)}`)
            id = newId;
        }

        //find the model
        mTab.seek(id*4);
        let mdlOffs = mTab.readU32();
        console.log(`Load model ${id} from offs 0x${hex(mdlOffs,8)}`);

        //load the model
        if((mdlOffs & 0x30000000) == 0) {
            console.error(`Model 0x${hex(id)} not found in ${dir}`);
            return null;
        }
        mdlOffs &= 0x0FFFFFFF;
        const data = mBin.decompress(mdlOffs);
        console.log(`modelId=0x${hex(id)} mdlOffs=0x${hex(mdlOffs,6)}`, data);

        const mdlView = new DataView(data);
        const model = Model.fromData(this, gx, mdlView, dir);
        model.offset = mdlOffs;

        this.loadedModels[origId] = model;
        return model;
    }

    unloadModels() {
        this.loadedModels = {};
    }

    async _loadDlls() {
        await this.app.progress.update({subText:"Downloading dlls.xml..."});
        const xml = await getXml(`data/${this.version}/dlls.xml`);
        if(!xml) return;
        this.dllTableAddr = int(xml.getElementsByTagName('dlls')[0].
            getAttribute('tableAddress'));
        this.dlls = {};
        for(let elem of xml.getElementsByTagName('dll')) {
            const dll = new DLL(this, elem);
            this.dlls[dll.id] = dll;
        }
    }

    async _loadObjects() {
        this.objsTab = this.iso.getFile('/OBJECTS.tab').getData();
        this.objsBin = this.iso.getFile('/OBJECTS.bin').getData();

        //parse OBJINDEX.bin
        const objIndex = this.iso.getFile('/OBJINDEX.bin').getData();
        this.objIndex  = [];
        const revIndex = {};
        for(let i=0; i<objIndex.byteLength; i += 2) {
            if(!(i % 100)) {
                await this.app.progress.update({
                    subText:"Parsing OBJINDEX.bin...",
                    numSteps: objIndex.byteLength / 2,
                    stepsDone: i / 2,
                });
            }
            const idx = objIndex.getInt16(i);
            this.objIndex.push(idx);
            //file is padded with zeros so don't let those overwrite
            //the actual index zero
            if(idx >= 0 && revIndex[idx] == undefined) revIndex[idx] = i >> 1;
        }

        //parse OBJECTS.bin
        this.objects = [];
        for(let i=0; this.objsTab.getInt32((i+1)*4) >= 0; i++) {
            if(!(i % 100)) {
                await this.app.progress.update({
                    subText:"Parsing OBJECTS.bin...",
                    numSteps: this.objsTab.byteLength / 4, //approximate
                    stepsDone: i,
                });
            }
            const obj = new GameObject(this, i);
            if(revIndex[i] != undefined) obj.index = revIndex[i];
            this.objects.push(obj);
        }
    }

    async _loadMaps() {
        const parser = new MapParser(this);
        await parser.parse();
    }

    async _loadTexts(lang) {
        await this.app.progress.update({
            subText:"Downloading gametext...",
            numSteps: 1, stepsDone: 0,
        });
        const xml = await getXml(`data/${this.version}/gametext/${lang}.xml`);
        if(!xml) return;
        this.texts = {};
        let iText = 0;
        for(let eText of xml.getElementsByTagName('text')) {
            if(!(iText++ % 100)) {
                await this.app.progress.update({
                    subText:"Parsing gametext...",
                    numSteps: 1, stepsDone: 0,
                });
            }
            let text = Text.fromXml(eText);
            this.texts[text.id] = text;
        }
    }

    _loadFileNames() {
        /** Load the asset file names from the DOL. */
        if(this.fileNames) return;
        let src, xlate;
        if(this.iso) {
            const dol    = this.iso.mainDol;
            const file   = new GameFile(dol.getData());
            xlate = (addr) => dol.addrToOffset(addr);
            src   = file;
        }
        else if(this.ram) {
            xlate = (addr) => (addr & 0x7FFFFFFF);
            src   = this.ram;
        }
        const aNames = this.addresses.fileNames;
        const names  = [];
        const usedName = new Set();
        for(let iFile=0; iFile<aNames.count; iFile++) {
            src.seek(xlate(aNames.address + (iFile*4)));
            const ptr = src.readU32();
            src.seek(xlate(ptr));
            let name = src.readStr(256);
            if(usedName.has(name)) {
                name = `${name}_${hex(iFile,2)}`;
            }
            usedName.add(name);
            names.push(name);
        }
        this.fileNames = names;
    }
}
