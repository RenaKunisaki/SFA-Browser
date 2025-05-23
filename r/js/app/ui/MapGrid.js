import Game from "../../game/Game.js";
import { E, clearElement } from "../../lib/Element.js";
import { assertType, hex } from "../../Util.js";

//XXX move these
const MAP_CELL_SIZE = 640;
const CHAR_NAMES = ["Krystal", "Fox"]; //in-game order

function mapIdToColor(id) {
    //arbitrary function for assigning map IDs a color.
    //I just picked something that looked nice.
    let n = id + 1;
    id = 0;
    for(let i=0; i<8; i++) id |= ((n >> i) & 1) << i;
    let r = ((id >> 1) & 3) / 3;
    let g = ((id >> 3) & 7) / 7;
    let b = ((id >> 6) & 3) / 3;
    r = Math.floor(r * 255);
    g = Math.floor(g * 255);
    b = Math.floor(b * 255);
    return [r, g, b];
}

/** Displays global map grid.
 */
export default class MapGrid {
    constructor(game) {
        this.game    = assertType(game, Game);
        this.app     = game.app;
        this.layerNo = 0;
        this.element = document.getElementById('tab-mapGrid');
        this.app.onIsoLoaded(iso => this._onIsoLoaded());
        this.app.onSaveSlotChanged(slot => this.refresh());

        this.eToolbar  = E.div('toolbar');
        this.eCellInfo = E.span('cellInfo');
        this.eBody     = E.div('body');
        clearElement(this.element).append(this.eToolbar, this.eBody);
    }

    _onIsoLoaded() {
        this._makeLayerPicker();
        this.refresh();
    }

    _makeLayerPicker() {
        const elem = E.select();
        for(let idx of Object.keys(this.game.mapGrid)) {
            elem.append(E.option(null, `Layer ${idx}`, {value:idx}));
        }
        elem.value = this.layerNo;
        elem.addEventListener('change', e => this.refresh());
        this.eLayerPicker = elem;
        clearElement(this.eToolbar).append(this.eLayerPicker, this.eCellInfo);
    }

    _getCell(layer, x, z) {
        let cell = layer[x];
        if(cell) cell = cell[z];
        return cell;
    }

    _getLayerBounds(layer) {
        const xMin    = Math.min(...Object.keys(layer));
        const xMax    = Math.max(...Object.keys(layer));

        //find range
        let zMin = 999999, zMax = -999999;
        for(let x=xMin; x<=xMax; x++) {
            if(layer[x]) {
                zMin = Math.min(zMin, ...Object.keys(layer[x]));
                zMax = Math.max(zMax, ...Object.keys(layer[x]));
            }
        }

        return {
            xMin:xMin, xMax:xMax,
            zMin:zMin, zMax:zMax,
        };
    }

    _makeHorizontalAxis(xMin, xMax) {
        let tr = E.tr('header', E.th());
        for(let x=xMin; x<=xMax; x++) {
            tr.append(E.th('coord', x));
        }
        tr.append(E.th());
        return tr;
    }

    _addCharPositions() {
        //add the saved player positions.
        if(!this.app.saveSlot) return;

        for(let i=0; i<2; i++) {
            const pos = this.app.saveSlot.charPos[i];
            if(pos.mapLayer != this.layerNo) continue;

            let td = this.cellElems[Math.floor(pos.pos.z / MAP_CELL_SIZE)];
            if(td) td = td[Math.floor(pos.pos.x / MAP_CELL_SIZE)];
            if(td) {
                td.classList.add(CHAR_NAMES[i]);
                let title = td.getAttribute('title');
                if(!title) title = ''; else title += '\n';
                title += `${CHAR_NAMES[i]}'s saved position`;
                td.setAttribute('title', title);
            }
        }
    }

    _addWarps() {
        if(!this.game.warpTab) return;
        for(let [idx, warp] of Object.entries(this.game.warpTab)) {
            if(warp.layer == this.layerNo) {
                let td = this.cellElems[Math.floor(warp.pos.z / MAP_CELL_SIZE)];
                if(td) td = td[Math.floor(warp.pos.x / MAP_CELL_SIZE)];
                if(td) {
                    td.classList.add('hasWarp');
                    let title = td.getAttribute('title');
                    if(!title) title = ''; else title += '\n';
                    title += `Warp #0x${hex(parseInt(idx),2)}`;
                    td.setAttribute('title', title);
                }
            }
        }
    }

    _makeCellForBlock(cell) {
        let block = cell.block;
        let text = ' ';
        let cls  = ' oob';
        if(block != undefined) {
            const mod = block.mod.toString().padStart(2);
            const sub = block.sub.toString().padStart(2);
            text = E.span(E.div(null, mod), E.div(null, sub));
            cls  = '';
        }

        let title = `#0x${hex(cell.map.id)} (dir 0x${hex(cell.map.dirId)}) ${cell.map.name}`;
        if(block) title += ` [mod${block.mod}.${block.sub}]`;
        else title += ' [Out of Bounds]';
        //if(cell.isOrigin) title += ' [Map origin]';
        title += `\nMap relative: ${cell.relX}, ${cell.relZ}`;
        title += `\nWorld pos: ${cell.worldX*MAP_CELL_SIZE}, ${cell.worldZ*MAP_CELL_SIZE}`;

        //let bg = mapIdToColor(cell.mapId);
        let bg = mapIdToColor(block ? block.mod : 0);
        let td = E.td('cell'+cls, text, {
            title: title,
            style: `background-color: rgb(${bg[0]}, ${bg[1]}, ${bg[2]})`,
        });

        if(cell.relX == cell.map.minX) td.classList.add('left');
        if(cell.relX == cell.map.maxX) td.classList.add('right');
        if(cell.relZ == cell.map.minZ) td.classList.add('bottom');
        if(cell.relZ == cell.map.maxZ) td.classList.add('top');
        if(cell.isOrigin) td.classList.add('origin');
        return td;
    }

    refresh() {
        if(!this.game.iso) return;
        const grid    = this.game.mapGrid;
        const elem    = E.table('mapGrid');
        const layerNo = this.eLayerPicker.value;
        this .layerNo = layerNo;
        const layer   = grid[layerNo];
        const {xMin, xMax, zMin, zMax} = this._getLayerBounds(layer);

        this.cellElems = {};
        elem.append(this._makeHorizontalAxis(xMin, xMax));

        for(let z=zMax; z>=zMin; z--) { //upside down
            this.cellElems[z] = {};
            let tr = E.tr('row', E.th('coord', z));
            for(let x=xMin; x<=xMax; x++) {
                let cell = this._getCell(layer, x, z);
                let td;
                if(cell != undefined) td = this._makeCellForBlock(cell);
                else td = E.td('empty', E.div({style:
                    'width: 25px; height: 25px; '
                }));
                if(x == 0) td.classList.add('xZero');
                if(z == 0) td.classList.add('zZero');
                tr.append(td);
                this.cellElems[z][x] = td;
                td.addEventListener('mouseover', e => {
                    let text = `${x*MAP_CELL_SIZE}, ${z*MAP_CELL_SIZE}`;
                    text += ` (${x}, ${z})`;
                    if(cell) text += ` - ${cell.map.name}`;
                    this.eCellInfo.innerText = text;
                })
            }
            tr.append(E.th('coord', z));
            elem.append(tr);
        }
        elem.append(this._makeHorizontalAxis(xMin, xMax));

        //add character postions and warps
        this._addCharPositions();
        this._addWarps();

        //clear this too, to get rid of "select an ISO" message
        clearElement(this.element).append(this.eToolbar, this.eBody);
        clearElement(this.eBody).append(elem);
    }
}
