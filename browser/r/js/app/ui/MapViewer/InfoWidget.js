import { clearElement, E } from "../../../lib/Element.js";
import { hex } from "../../../Util.js";

export default class InfoWidget {
    /** Widget displaying info about selected object. */
    constructor(mapViewer) {
        this.mapViewer = mapViewer;
        this.game      = mapViewer.game;
        this.app       = mapViewer.game.app;
        this._tbl      = E.table();
        this.element   = E.details('obj-info', {open:'open'},
            E.summary(null, "Selection"),
            this._tbl,
        );
        this.show(null);
    }

    show(info) {
        /** Display info about an object.
         *  @param {object} obj What to show. Can be null.
         */
        clearElement(this._tbl);
        if(info == null) {
            this._tbl.append(E.tr(
                E.th(null, "Nothing selected"),
            ));
            return;
        }

        switch(info.type) {
            case 'mapBlockDlist': this._showBlockDlist(info); break;
            case 'object': this._showObject(info); break;
            case 'warp': this._showWarp(info); break;
            default:
                this._tbl.append(E.tr(
                    E.th('error', `Unknown object type: "${info.type}"`),
                ));
        }
    }

    _showBlockDlist(info) {
        /** Display info about a map block display list.
         *  @param {object} info The block info.
         */
        console.log("show block dlist", info);
        const block = info.block;
        const rows = [
            E.tr(E.th(null, `Block "${block.header.name}"`, {colspan:2})),
            E.tr(
                E.th(null, "Y range"),
                E.td('float', `${block.header.yMin}, ${block.header.yMax}`),
            ),
            E.tr(
                E.th(null, "Y offs"),
                E.td('float', block.header.yOffset),
            ),
            E.tr(
                E.th(null, "Stream"),
                E.td('string', info.stream),
            ),
            E.tr(
                E.th(null, "Polygons"),
                E.td('int', block.header.nPolygons),
            ),
            E.tr(
                E.th(null, "PolyGroups"),
                E.td('int', block.header.nPolyGroups),
            ),
            E.tr(
                E.th(null, "Dlists"),
                E.td('int', block.header.nDlists),
            ),
            E.tr(
                E.th(null, "Shaders"),
                E.td('int', block.header.nShaders),
            ),
            E.tr(
                E.th(null, "Textures"),
                E.td('int', block.header.nTextures),
            ),
            E.tr(
                E.th(null, "Vertices"),
                E.td('int', block.header.nVtxs),
            ),
            E.tr(
                E.th(null, "Flags 04"),
                E.td('hex', hex(block.header.flags_0x4, 2)),
            ),
        ];
        this._tbl.append(...rows);
    }

    _showObject(info) {
        /** Display info about a game object instance.
         *  @param {object} info The object info.
         *  @note `info.obj` should be a RomListEntry.
         */
        console.log("show obj", info);
        const entry = info.obj;
        const dll   = entry.object.dll;
        const rows = [
            E.tr(E.th(null, `Object ID 0x${hex(entry.id, 8)}`, {colspan:2})),
            E.tr(
                E.th(null, "Name"),
                E.td('string objName', entry.object.header.name),
            ),
            E.tr(
                E.th(null, "Entry#"),
                E.td('int', entry.idx),
            ),
            E.tr(
                E.th(null, "Def#"),
                E.td('hex objDefNo', `0x${hex(entry.objDef, 4)}`),
            ),
            E.tr(
                E.th(null, "Position"),
                E.td('vec3f objPos', `${entry.position.x.toFixed(2)}, ${entry.position.y.toFixed(2)}, ${entry.position.z.toFixed(2)}`),
            ),
            E.tr(
                E.th(null, "DLL"),
                E.td('dllId', `#0x${hex(entry.object.header.dll_id, 4)} `+
                    (dll ? dll.name : '-')),
            ),
        ];
        let params = entry.params;
        if(params == null) params = {};
        for(const [name, param] of Object.entries(params)) {
            rows.push(E.tr(
                E.th('objparam', name),
                E.td(null, param.value.display),
            ))
        }
        this._tbl.append(...rows);
    }

    _showWarp(info) {
        /** Display info about a WARPTAB entry.
         *  @param {object} info The warp info.
         */
        console.log("show warp", info);
        const warp = info.warp;
        const rows = [
            E.tr(E.th(null, `Warp #0x${hex(info.idx,2)}`, {colspan:2})),
            E.tr( E.th(null, "X"), E.td('float', warp.pos.x) ),
            E.tr( E.th(null, "Y"), E.td('float', warp.pos.y) ),
            E.tr( E.th(null, "Z"), E.td('float', warp.pos.z) ),
            E.tr(
                E.th(null, "Angle"),
                E.td('int',
                    `${Math.round((warp.xRot / 65536)*360)}\u00B0 (0x${hex(warp.xRot,4)})`),
            ),
        ];
        this._tbl.append(...rows);
    }
}
