import RomList from "./RomList.js";
import GameFile from "./../GameFile.js";
import { assertType, getAttr, getXml, int } from "../../Util.js";
import Map from "./Map.js";
import Block from "./Block.js";
import Game from "../Game.js";

//struct types
let MapsBinEntry0, MapsTabEntry, MapInfoEntry, MapGridItem;

/** Parses MAPS.bin, MAPINFO.bin, romlists, etc for all maps. */
export class MapParser {
    constructor(game) {
        this.game          = assertType(game, Game);
        this.app           = game.app;
        this.game.maps     = {};
        this.game.mapDirs  = {}; //name => map
        this._mapsByDirId  = {};
        this._usedRomLists = {};

        MapsBinEntry0 = this.app.types.getType('sfa.maps.MapsBinEntry0');
        MapsTabEntry  = this.app.types.getType('sfa.maps.MapsTabEntry');
        MapInfoEntry  = this.app.types.getType('sfa.maps.MapInfoEntry');
        MapGridItem   = this.app.types.getType('sfa.maps.MapGridItem');
    }
    _getMapById(id) {
        let map = this.game.maps[id];
        if(map == undefined) {
            map = new Map(this.game, {id:id});
            this.game.maps[id] = map;
        }
        return map;
    }
    _getMapByDirId(id) {
        let map = this._mapsByDirId[id];
        if(map == undefined) {
            map = new Map(this.game, {dirId:id});
            this._mapsByDirId[id] = map;
        }
        return map;
    }
    async parse() {
        /** Read map info from game. */
        this.app.progress.show({
            taskText: "Reading maps",
            subText:  "Parsing DOL...",
            numSteps: 1, stepsDone: 0,
        });
        this.readIdxTable();
        this.readMapNames();
        this.readParents();
        this.readDirNames();
        await this.parseMapsBin();
        await this.parseMapInfo();
        await this.parseGlobalMap();
        await this.findStrayRomLists();
        await this.parseMapsXml();

        //ensure all maps are in game.maps and game.mapDirs.
        for(let map of Object.values(this._mapsByDirId)) {
            this.game.maps[map.id] = map;
        }
        for(let map of Object.values(this.game.maps)) {
            map.dirName = this.game.mapDirs[map.dirId];
            this.game.mapsByDirId[map.dirId] = map;
        }

        //add an entry for the assets in the disc root.
        this.game.maps[0xFF] = new Map(this.game, {
            id: 0xFF,
            dirName: '/',
            dirId: -1,
            name: "(disc root)",
            description: "Leftover assets in disc root",
            isUsed: false,
            blocks: [],
        });

        return this.game.maps;
    }
    readMapNames() {
        //romlist file names
        //Kiosk version doesn't use separate romlist files,
        //so doesn't have this table.
        if(this.game.version == 'K0') return;
        const dol    = this.game.iso.mainDol;
        const file   = new GameFile(dol.getData());
        const aNames = this.game.addresses.mapName;
        for(let iMap=0; iMap<aNames.count; iMap++) {
            const map = this._getMapById(iMap);
            file.seek(dol.addrToOffset(aNames.address + (iMap*4)));
            const ptr = file.readU32();
            file.seek(dol.addrToOffset(ptr));
            map.romListName = file.readStr(256);
            this._usedRomLists[map.romListName] = true;
        }
    }
    readDirNames() {
        //asset dir names
        //this table contains several duplicate entries, which is why we need
        //to track both the dir name and the dir ID (which is just the index
        //into this table).
        const dol    = this.game.iso.mainDol;
        const file   = new GameFile(dol.getData());
        const aNames = this.game.addresses.mapDirNames;
        this.game.mapDirs = [];
        for(let iDir=0; iDir<aNames.count; iDir++) {
            file.seek(dol.addrToOffset(aNames.address + (iDir*4)));
            const ptr = file.readU32();
            file.seek(dol.addrToOffset(ptr));
            this.game.mapDirs.push(file.readStr(256));
        }
    }
    readIdxTable() {
        //translates map dir ID to map ID (MAPINFO.BIN index)
        const dol    = this.game.iso.mainDol;
        const file   = new GameFile(dol.getData());
        const aTable = this.game.addresses.mapIdXltnTbl;
        file.seek(dol.addrToOffset(aTable.address));
        for(let iMap=0; iMap<aTable.count; iMap++) {
            let id = file.readS32();
            if(id < 0) break;
            const map = this._getMapById(iMap);
            map.dirId = id;
            this._mapsByDirId[map.dirId] = map;
        }
    }
    readParents() {
        //each map has a parent map ID.
        //if it's not -1, it's the dir ID of another map that should also be
        //loaded alongside this one.
        //this table is a mapping of dir ID => parent dir ID.
        const dol    = this.game.iso.mainDol;
        const file   = new GameFile(dol.getData());
        const aTable = this.game.addresses.parentMapId;
        file.seek(dol.addrToOffset(aTable.address));
        for(let iMap=0; iMap<aTable.count; iMap++) {
            const map = this._getMapByDirId(iMap);
            let parent = file.readS16();
            //if(parent == -1) parent = null;
            map.parentId = parent;
        }
    }
    async parseMapInfo() {
        await this.app.progress.update({
            subText:  "Parsing MAPINFO.bin...",
            numSteps: 1, stepsDone: 0,
        });
        this.mapInfo = new GameFile(this.game.iso.getFile('/MAPINFO.bin'));
        const view = this.mapInfo.getView();
        for(let map of Object.values(this.game.maps)) {
            if(map.id != undefined) {
                let entry = MapInfoEntry.fromBytes(view,
                    map.id * MapInfoEntry.size);
                map.name    = entry.name;
                map.type    = entry.type;
                map.unk1D   = entry.unk1D;
                map.objType = entry.objType;
            }
        }
    }
    async parseGlobalMap() {
        await this.app.progress.update({
            subText:  "Parsing globalma.bin...",
            numSteps: 1, stepsDone: 0,
        });
        this.game.mapGrid = {}; //layer => array
        const globalMap = new GameFile(this.game.iso.getFile('/globalma.bin'));
        const view = globalMap.getView();
        for(let i=0; ; i++) {
            let entry = MapGridItem.fromBytes(view, i * MapGridItem.size);
            if(entry.mapId < 0) break;
            this._parseGlobalMapEntry(entry);
        }
    }
    _parseGlobalMapEntry(entry) {
        const layers = this.game.mapGrid;
        let map = this._getMapById(entry.mapId);
        if(layers[entry.layer] == undefined) layers[entry.layer] = [];
        let layer = layers[entry.layer];
        if(layer[entry.x] == undefined) layer[entry.x] = [];
        map.links  = entry.link;
        map.minX   =  999999; map.minZ =  999999;
        map.maxX   = -999999; map.maxZ = -999999;
        map.worldX = entry.x; // + map.originX;
        map.worldZ = entry.z; // + map.originZ;
        for(let x=0; x<map.sizeX; x++) {
            for(let z=0; z<map.sizeZ; z++) {
                let cx = (x + entry.x) - map.originX;
                let cz = (z + entry.z) - map.originZ;
                let iBlock = (z * map.sizeX) + x;
                if(layer[cx] == undefined) layer[cx] = [];

                let relX = x - map.originX;
                let relZ = z - map.originZ;

                //maps can overlap
                if(map.blocks[iBlock] != null || !(layer[cx][cz])) {
                    map.layer  = entry.layer;
                    layer[cx][cz] = {
                        worldX: cx,
                        worldZ: cz,
                        layer:  entry.layer,
                        mapId:  entry.mapId,
                        link:   entry.link,
                        map:    map,
                        relX:   x - map.originX,
                        relZ:   z - map.originZ,
                        block:  map.blocks[iBlock],
                        isOrigin: x == map.originX && z == map.originZ,
                    };
                    if(relX > map.maxX) map.maxX = relX;
                    if(relZ > map.maxZ) map.maxZ = relZ;
                    if(relX < map.minX) map.minX = relX;
                    if(relZ < map.minZ) map.minZ = relZ;
                }
                else if(map.blocks[iBlock] != null && layer[cx][cz]) {
                    console.warn(`Map block overlap at ${cx},${cz} L${entry.layer}`,
                        entry, map.blocks[iBlock]);
                }
            }
        }
        //console.log("parsed GlobalMap entry", map);
    }
    async parseMapsBin() {
        this.mapsBin = new GameFile(this.game.iso.getFile('/MAPS.bin'));
        this.mapsTab = new GameFile(this.game.iso.getFile('/MAPS.tab'));
        const nMaps  = Math.floor(this.mapsTab.byteLength / MapsTabEntry.size);
        const vBin   = this.mapsBin.getView();
        const vTab   = this.mapsTab.getView();
        for(let iMap=0; iMap<nMaps; iMap++) {
            await this.app.progress.update({
                subText:   "Parsing MAPS.bin...",
                numSteps:  nMaps, stepsDone: iMap,
            });
            let tab  = MapsTabEntry .fromBytes(vTab, iMap * MapsTabEntry.size);
            let info = MapsBinEntry0.fromBytes(vBin, tab.info);
            let map  = this._getMapById(iMap);
            map.sizeX   = info.sizeX;
            map.sizeZ   = info.sizeZ;
            map.originX = info.originX;
            map.originZ = info.originZ;
            map.nBlocks = info.nBlocks; //maybe memory for block data?
            map.unk08   = info.unk08;
            map.unk0C   = info.unk0C;
            map.unk1E   = info.unk1E;
            map.blocks  = this._readBlocks(map, tab.blocks);
            this._readRomList(tab.romList, map);
            //console.log("parsed MAPS.bin entry", map);
        }
    }
    _readBlocks(map, offset) {
        const result = [];
        let blocks;

        //read the list of blocks from MAPS.bin
        this.mapsBin.seek(offset);
        try {
            blocks = this.mapsBin.readU32Array(map.sizeX * map.sizeZ);
        }
        catch(ex) {
            if(ex instanceof RangeError) {
                console.log("Map has invalid blocks offset:", map);
                return [];
            }
            else throw ex;
        }
        let x = 0, z = 0;
        for(let blockData of blocks) {
            let block = new Block(this.game, map, x, z, blockData);
            if(block.mod == 0xFF) block = null;
            result.push(block);
            x++;
            if(x >= map.sizeX) { x=0; z++ }
        }
        return result;
    }
    _readRomList(offset, map) {
        if(this.game.version == 'K0') {
            //for kiosk version the romlist is inside MAPS.bin
            const data = this.mapsBin.decompress(offset);
            map.romListSize = data.byteLength;
            map.romList     = new RomList(this.game, data);
        }
        else {
            //for other versions only the size is here, used to tell how
            //much memory to allocate. we don't need to check it.
            //XXX we should, though.
            if(!map.romListName) {
                console.error("No romListName for map", map);
                return null;
            }
            const path = `/${map.romListName}.romlist.zlb`;
            let   file = this.game.iso.getFile(path);
            let   data;
            if(!file) {
                console.log('File not found:', path);
                //the game will also check MAPS.bin.
                //XXX check if any maps have old romlists here.
                data = new this.mapsBin.decompress(offset);
            }
            else data = new GameFile(file);
            map.romListSize = data.byteLength;
            map.romList     = new RomList(this.game, data);
        }
    }
    async findStrayRomLists() {
        //find romlist files not referenced by maps
        const iso = this.game.iso;
        let iFile = 0;
        let nextId = -1;
        for(let file of iso.files) {
            iFile++;
            if(file.name.endsWith('.romlist.zlb')) {
                await this.app.progress.update({
                    subText:`Parsing ${file.name}...`,
                    numSteps: iso.files.length,
                    stepsDone: iFile,
                });
                let name = file.name.split('.')[0];
                if(!this._usedRomLists[name]) {
                    const map = new Map(this.game);
                    map.romListName = name;
                    this.game.maps[nextId--] = map;
                    this._usedRomLists[name] = true;
                }
            }
        }
    }
    async parseMapsXml() {
        //get maps.xml for additional info
        await this.app.progress.update({
            subText:"Downloading maps.xml...",
            numSteps: 1, stepsDone: 0,
        });
        const xml = await getXml(`./data/${this.game.version}/maps.xml`);
        if(!xml) return;

        for(let elem of xml.getElementsByTagName('map')) {
            let map;
            let id = int(getAttr(elem, 'id'));
            if(id == undefined) {
                id = int(getAttr(elem, 'dirid'));
                if(id == undefined) continue;
                map = this._getMapByDirId(id);
            }
            else map = this._getMapById(id);
            if(!map) continue;

            let desc = elem.getElementsByTagName('description');
            if(desc && desc[0]) map.description = desc[0].textContent;

            map.isUsed = getAttr(elem, 'isused') != '0';
        }
    }
}
