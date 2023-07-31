import Game from "../../game/Game.js";
import { E, clearElement } from "../../lib/Element.js";
import { assertType, hex } from "../../Util.js";
import Table from "./Table.js";

//struct types
let ObjInstance, ObjectData;

/** Displays info from RAM dump.
 */
export default class RamInfo {
    constructor(game) {
        this.game    = assertType(game, Game);
        this.app     = game.app;
        this.element = document.getElementById('tab-ramInfo');
        this.app.onRamLoaded(ram => this.refresh());
    } //constructor

    refresh() {
        ObjInstance = this.app.types.getType('sfa.objects.ObjInstance');
        ObjectData = this.app.types.getType('sfa.objects.ObjectData');
        const elem = E.div('ramInfo', this._makeLoadedObjWidget(),
            this._makeLoadedFilesWidget());
        clearElement(this.element).append(elem);
    }

    /** Create the widget that will show the list of loaded objects. */
    _makeLoadedObjWidget() {
        const ram = this.app.ramDump;

        const aNObjs = ram.addrToOffset(this.game.addresses.nLoadedObjs.address);
        ram.data.seek(aNObjs);
        const nObjs = ram.data.readU32();

        let loaded = false;
        let eList = E.div('loading', "Loading...");
        const eObjs = E.details('objlist',
            E.summary(null, `Objects: ${nObjs.toLocaleString()}`),
            eList,
        );
        eObjs.addEventListener('toggle', e => {
            if(!eObjs.open) return;
            if(loaded) return;
            const lst = this._makeLoadedObjList();
            clearElement(eList).append(lst);
            loaded = true;
        })
        return eObjs;
    }

    /** Create the list of loaded objects. */
    _makeLoadedObjList() {
        const ram = this.app.ramDump;
        const tbl = this._makeObjListTable();

        //populate the table
        const objs = ram.getLoadedObjects();
        for(let iObj=0; iObj<objs.length; iObj++) {
            tbl.add(this._makeObjListRow(ram, iObj, objs[iObj]));
        }

        return tbl.element;
    }

    _makeObjListTable() {
        return new Table({title:"Objects", columns: [
            {displayName:"#", name:'idx', type:'hex', length:4,
                title:"Index in object list"},
            {displayName:"Def#", name:'defNo',   type:'hex', length:4,
                title:"ObjDef ID"},
            {displayName:"Name", name:'name',   type:'string',
                title:"ObjDef Name"},
            {displayName:"UniqueID", name:'id',   type:'hex', length:8,
                title:"Object unique ID"},
            {displayName:"RAM Addr", name:'addr',   type:'hex', length:8,
                title:"ObjInstance address"},
            {displayName:"DataAddr", name:'data',   type:'hex', length:8,
                title:"ObjData address"},
            {displayName:"Def Addr", name:'def',    type:'hex', length:8,
                title:"ObjDef address"},
            {displayName:"StateAdr", name:'state',  type:'hex', length:8,
                title:"Obj state address"},
            {displayName:"X", name:'x', type:'float', decimals:4, title:"X Coord"},
            {displayName:"Y", name:'y', type:'float', decimals:4, title:"Y Coord"},
            {displayName:"Z", name:'z', type:'float', decimals:4, title:"Z Coord"},
            {displayName:"Dist", name:'dist', type:'float', decimals:4, title:"Distance to Player"},
        ]});
    }

    _makeObjListRow(ram, iObj, obj) {
        const row = {
            idx:   iObj,
            addr:  obj.addr,
            data:  obj.ObjInstance.data,
            def:   obj.ObjInstance.objDef,
            defNo: obj.ObjInstance.defNo,
            name:  obj.ObjectData.name,
            id:    obj.RomListEntry ? obj.RomListEntry.id : null,
            state: obj.ObjInstance.state,
            x:     obj.ObjInstance.xf.pos.x,
            y:     obj.ObjInstance.xf.pos.y,
            z:     obj.ObjInstance.xf.pos.z,
        };

        if(ram.player) {
            const dx = obj.ObjInstance.xf.pos.x - ram.player.xf.pos.x;
            const dy = obj.ObjInstance.xf.pos.y - ram.player.xf.pos.y;
            const dz = obj.ObjInstance.xf.pos.z - ram.player.xf.pos.z;
            row.dist = Math.sqrt((dx*dx)+(dy*dy)+(dz*dz));
        }
        else row.dist = null;

        return row;
    }

    /** Create the widget that will show the list of loaded files. */
    _makeLoadedFilesWidget() {
        let loaded = false;
        let eList = E.div('loading', "Loading...");
        const eFiles = E.details('filelist',
            E.summary(null, "Loaded Files"),
            eList,
        );
        eFiles.addEventListener('toggle', e => {
            if(!eFiles.open) return;
            if(loaded) return;
            const lst = this._makeLoadedFilesList();
            clearElement(eList).append(
                this._makeCheckFilesButton(),
                lst);
            loaded = true;
        })
        this._fileCheckWidgets = {};
        return eFiles;
    }

    _makeFileListTable() {
        return new Table({title:"Files", columns: [
            {displayName:"#", name:'idx', type:'hex', length:2,
                title:"File ID"},
            {displayName:"Name", name:'name',   type:'string',
                title:"File Name"},
            {displayName:"RAM Addr", name:'address',type:'hex', length:8,
                title:"Loaded address"},
            {displayName:"Size", name:'size',   type:'hex', length:6,
                title:"Loaded size"},
            {displayName:"M#", name:'mapId',   type:'hex', length:2,
                title:"Loaded map ID"},
            {displayName:"Map", name:'mapName', type:'string',
                title:"Loaded map name"},
            {displayName:"OK", name:'ok', type:'string',
                title:"File integrity check"},
        ]});
    }

    _makeFileListRow(ram, iFile, file, checkWidget) {
        const row = {
            idx:     iFile,
            name:    ram.game.getFileName(iFile),
            address: file.address,
            size:    file.size,
            mapId:   file.mapId,
            mapName: ram.game.getMapDirName(file.mapId),
            ok:      checkWidget,
        };
        if(row.mapId == -1) row.mapId = null;
        return row;
    }

    /** Create the list of loaded files. */
    _makeLoadedFilesList() {
        const ram = this.app.ramDump;
        const tbl = this._makeFileListTable();

        //populate the table
        const files = ram.getLoadedFiles();
        for(let iFile=0; iFile<files.length; iFile++) {
            const check = E.div('file-integrity');
            this._fileCheckWidgets[iFile] = check;
            tbl.add(this._makeFileListRow(ram, iFile, files[iFile], check));
        }
        return tbl.element;
    }

    /** Create the Check File Integrity button. */
    _makeCheckFilesButton() {
        const btn = E.button(null, "Check File Integrity", {
            click: () => this._checkFiles(),
        });
        return btn;
    }

    /** Check integrity of files. */
    _checkFiles() {
        if(!this.game.iso) {
            alert("No ISO loaded.");
            return;
        }
        const ram = this.app.ramDump;
        const files = ram.getLoadedFiles();
        for(let iFile=0; iFile<files.length; iFile++) {
            this._checkFile(files[iFile], iFile)
        }
    }

    _checkFile(file, iFile) {
        const ram = this.app.ramDump;
        const ramFile = ram.openFileById(iFile);
        if(ramFile == null) return;
        const romFile = this.game.openMapFile(file.mapId, iFile);
        if(romFile == null) {
            console.error("Failed to open file", file);
            return;
        }
        const check = this._fileCheckWidgets[iFile];

        if(ramFile.size != romFile.size) {
            check.classList.add('fail');
            check.innerText = '✕';
            check.setAttribute('title',
                `Size mismatch (RAM:0x${hex(ramFile.size)} ROM:${hex(romFile.size)})`);
            console.log("Size mismatch", file);
            return;
        }

        ramFile.seek(0);
        romFile.seek(0);
        for(let i=0; i<ramFile.size; i += 4) {
            let b1 = ramFile.readU32();
            let b2 = romFile.readU32();
            if(b1 != b2) {
                check.classList.add('fail');
                check.innerText = '✕';
                check.setAttribute('title',
                    `Data mismatch at offset 0x${hex(i)}`);
                    console.log("Data mismatch", file);
                return;
            }
        }

        check.classList.add('ok');
        check.innerText = '✔';
        console.log("OK", file);
    }
}
