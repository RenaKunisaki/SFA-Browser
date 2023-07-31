import Game from "../Game.js";
import { assertType } from "../../Util.js";
import BinaryFile from "../../lib/BinaryFile.js";
import GameFile from "../GameFile.js";

//struct types
let ConsoleType, BootInfo;
let ObjInstance, ObjectData, RomListEntry;

const RAM_START = 0x80000000;

/** A raw RAM dump file. */
export default class RamDump {
    constructor(game) {
        this.game = assertType(game, Game);
        this.app  = game.app;

        ConsoleType = this.app.types.getType('dolphin.os.ConsoleType');
        BootInfo = this.app.types.getType('dolphin.os.BootInfo');
        ObjInstance = this.app.types.getType('sfa.objects.ObjInstance');
        ObjectData = this.app.types.getType('sfa.objects.ObjectData');
        RomListEntry = this.app.types.getType('sfa.maps.RomListEntry');
    }

    addrToOffset(addr) {
        if(addr < RAM_START || addr >= RAM_START + this._file.size) return null;
        return addr - RAM_START;
    }

    /** Load a save file.
     *  @param {BinaryFile} file The file to load.
     *  @param {String} version The game version this file belongs to.
     */
    async load(file, version='U0') {
        this._file    = file;
        this._version = version; //game version
        const buffer  = await this._file.arrayBuffer();
        const view    = new DataView(buffer);
        this.data     = new BinaryFile(view);
        this.view     = view;

        if(file.size != 24*1024*1024 //standard size
        && file.size != 48*1024*1024 //debug size
        && file.size != 88*1024*1024) { //Wii size
            throw new Error("File size is incorrect");
        }

        this.bootInfo = BootInfo.fromBytes(view, 0);
        this._objDatas = {}; //objdef => data

        //get the player object
        this.data.seek(this.addrToOffset(
            this.game.addresses.pPlayer.address));
        this.pPlayer = this.data.readU32();
        if(this.pPlayer) {
            this.player = ObjInstance.fromBytes(view,
                this.addrToOffset(this.pPlayer));
        }
        else this.player = null;
    }

    /** Get list of loaded game objects. */
    getLoadedObjects() {
        const data = this.data;
        const view = this.view;

        //get the object pointer list
        const aNObjs = this.addrToOffset(this.game.addresses.nLoadedObjs.address);
        data.seek(aNObjs);
        const nObjs = data.readU32();

        const aObjs = this.addrToOffset(this.game.addresses.loadedObjs.address)
        data.seek(aObjs);
        const pObjs = this.addrToOffset(data.readU32());
        if(!(pObjs && nObjs)) return [];

        //get the pointers
        data.seek(pObjs);
        const objList = data.readU32(nObjs);

        //get the objects
        const objs = [];
        for(let pObj of objList) {
            const obj = ObjInstance.fromBytes(view, this.addrToOffset(pObj));

            let data = this._objDatas[obj.defNo];
            if(!data) {
                data = ObjectData.fromBytes(view, this.addrToOffset(obj.data));
                this._objDatas[obj.defNo] = data;
            }

            const aDef = this.addrToOffset(obj.objDef);
            const def  = aDef ? RomListEntry.fromBytes(view, aDef) : null;

            objs.push({
                addr:         pObj,
                ObjInstance:  obj,
                ObjectData:   data,
                RomListEntry: def,
            });
        }
        return objs;
    }

    /** Get list of loaded files. */
    getLoadedFiles() {
        const aPtr   = this.addrToOffset(this.game.addresses.loadedFiles.address);
        const aSize  = this.addrToOffset(this.game.addresses.loadedFileSizes.address);
        const aMapId = this.addrToOffset(this.game.addresses.loadedFileMapIds.address);

        const files = [];
        const count = this.game.addresses.loadedFiles.count;
        for(let i=0; i<count; i++) {
            const file = {};

            this.data.seek((i*4) + aPtr);
            file.address = this.data.readU32();

            this.data.seek((i*4) + aSize);
            file.size = this.data.readU32();

            this.data.seek((i*2) + aMapId);
            file.mapId = this.data.readS16();

            files.push(file);
        }

        return files;
    }

    openFileById(id) {
        const aPtr  = this.addrToOffset(this.game.addresses.loadedFiles.address);
        this.data.seek(aPtr + (id*4));
        const addr = this.data.readU32() & 0x7FFFFFFF;
        if(addr == 0) return null;

        const aSize = this.addrToOffset(this.game.addresses.loadedFileSizes.address);
        this.data.seek(aSize + (id*4));
        const size = this.data.readU32();
        return new GameFile(this.data, addr, size);
    }
}
