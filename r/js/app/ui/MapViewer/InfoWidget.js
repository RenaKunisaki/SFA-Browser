import {MAP_CELL_SIZE} from "../../../game/Game.js";
import { clearElement, E } from "../../../lib/Element.js";
import { bin, hex } from "../../../Util.js";

//struct types
let SurfaceType, HitType, ObjCatId;

/** Widget displaying info about selected object. */
export default class InfoWidget {
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

    /** Display info about an object.
     *  @param {object} info What to show. Can be null.
     */
    show(info) {
        clearElement(this._tbl);
        if(info == null) {
            this._tbl.append(E.tr(
                E.th(null, "Nothing selected"),
            ));
            return;
        }

        if(this.app.types) {
            SurfaceType = this.app.types.getType('sfa.maps.SurfaceType');
            HitType = this.app.types.getType('sfa.maps.HitType');
            ObjCatId = this.app.types.getType('sfa.objects.ObjCatId');
        }

        console.log("show", info);
        switch(info.type) {
            case 'blockHit':      this._showBlockHit(info);       break;
            case 'collisionMesh': this._showBlockCollision(info); break;
            case 'mapBlockDlist': this._showBlockDlist(info);     break; //XXX not used anymore?
            case 'dlist':         this._showBlockDlist(info);     break;
            case 'object':        this._showObject(info);         break;
            case 'polyGroup':     this._showBlockPolyGroup(info); break;
            case 'warp':          this._showWarp(info);           break;
            default:
                this._tbl.append(E.tr(
                    E.th('error', `Unknown object type: "${info.type}"`),
                ));
        }
    }

    /** Display info about a map block collision triangle.
     *  @param {object} info The block info.
     */
    _showBlockCollision(info) {
        const block = info.block;
        const poly  = info.poly;
        const rows = [
            E.tr(E.th(null, `Hit Tri #${info.idx}`, {colspan:2})),
            E.tr( E.th(null, "Block"), E.td('string', block.header.name) ),
            E.tr(
                E.th(null, "Offset"),
                E.td('hex', `0x${hex(poly.offset, 6)}`),
            ),
            E.tr(
                E.th(null, "Idx"),
                E.td('hex', poly.index),
            ),
            E.tr(
                E.th(null, "Vtxs"),
                E.td('string', `${poly.vtxs[0]}, ${poly.vtxs[1]}, ${poly.vtxs[2]}`),
            ),
            E.tr(
                E.th(null, "SubX"),
                E.td('binary', bin(poly.subBlocks & 0xFF)),
            ),
            E.tr(
                E.th(null, "SubZ"),
                E.td('binary', bin(poly.subBlocks >> 8)),
            ),
            E.tr(E.th(null, `Hit Group #${poly.groupIdx}`, {colspan:2})),
            ...this._makeBlockPolyGroupInfo(block, poly.group),
        ];
        this._tbl.append(...rows);
    }

    /** Display info about a map block display list.
     *  @param {object} info The block info.
     */
    _showBlockDlist(info) {
        const block = info.block ? info.block : info.model;
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

    /** Display info about a HITS.bin entry.
     *  @param {object} info The block info.
     */
    _showBlockHit(info) {
        const hit = info.hit;
        const [x1,y1,z1] = hit.coords[0];
        const [x2,y2,z2] = hit.coords[1];
        const rows = [
            E.tr(E.th(null, `Hit #${info.idx}`, {colspan:2})),
            E.tr( E.th(null, "Offset"), E.td('hex', `0x${hex(info.offset,6)}`) ),
            E.tr( E.th(null, "Block"), E.td('string', info.block.header.name) ),
            E.tr( E.th(null, "Type"), E.td('string',
                `0x${hex(hit.type,2)} ${HitType.valueToString(hit.type)}`,
            )),
            E.tr( E.th(null, "X"), E.td('float', `${x1} - ${x2}`) ),
            E.tr( E.th(null, "Y"), E.td('float', `${y1} - ${y2}`) ),
            E.tr( E.th(null, "Z"), E.td('float', `${z1} - ${z2}`) ),
            E.tr( E.th(null, "Height"), E.td('int', `${hit.height[0]}, ${hit.height[1]}`) ),
            E.tr( E.th(null, "IgnorePlayer"),  E.td('bool', hit.flags.ignorePlayer ? 'Yes' : 'No')),
            E.tr( E.th(null, "IgnoreTricky"),  E.td('bool', hit.flags.ignoreTricky ? 'Yes' : 'No')),
            E.tr( E.th(null, "UnkFlag04"),  E.td('bool', hit.flags.unk04 ? 'Yes' : 'No')),
            E.tr( E.th(null, "UnkFlag08"),  E.td('bool', hit.flags.unk08 ? 'Yes' : 'No')),
            E.tr( E.th(null, "UnkFlag10"),  E.td('bool', hit.flags.unk10 ? 'Yes' : 'No')),
            E.tr( E.th(null, "UnkFlag20"),  E.td('bool', hit.flags.unk20 ? 'Yes' : 'No')),
            E.tr( E.th(null, "UnkFlag40"),  E.td('bool', hit.flags.unk40 ? 'Yes' : 'No')),
            E.tr( E.th(null, "UnkTypeBits"),  E.td('int', hit.unkTypeBits)),
            E.tr( E.th(null, "Unk10"),  E.td('hex', `0x${hex(hit.unk10,4)} 0x${hex(hit.unk12,4)}`)),
        ];
        this._tbl.append(...rows);
    }

    /** Display info about a map block collision group.
     *  @param {object} info The block info.
     */
    _showBlockPolyGroup(info) {
        const block = info.block;
        const group = info.group;
        const rows = [
            E.tr(E.th(null, `Hit Group #${info.idx}`, {colspan:2})),
            E.tr( E.th(null, "Block"), E.td('string', block.header.name) ),
            ...this._makeBlockPolyGroupInfo(block, group),
        ];
        this._tbl.append(...rows);
    }

    _makeBlockPolyGroupInfo(block, group) {
        if(!group) {
            return [
                E.tr(null, E.td('notice', "Poly isn't in a group", {colspan:2}))
            ];
        }
        const sx    = Math.abs(group.x1 - group.x2);
        const sy    = Math.abs(group.y1 - group.y2);
        const sz    = Math.abs(group.z1 - group.z2);
        return [
            E.tr(
                E.th(null, "Offset"),
                E.td('hex', `0x${hex(group.offset, 6)}`),
            ),
            E.tr(
                E.th(null, "Idx"),
                E.td('hex', group.index),
            ),
            E.tr(
                E.th(null, "1stPoly"),
                E.td('int', group.firstPolygon),
            ),
            E.tr( E.th(null, "X"), E.td('float', `${group.x1} - ${group.x2} (${sx})`) ),
            E.tr( E.th(null, "Y"), E.td('float', `${group.y1} - ${group.y2} (${sy})`) ),
            E.tr( E.th(null, "Z"), E.td('float', `${group.z1} - ${group.z2} (${sz})`) ),
            E.tr(
                E.th(null, "Flags"),
                E.td('hex', `0x${hex(group._10, 2)}, 0x${hex(group.flags, 4)}`),
            ),
            E.tr(
                E.th(null, "Type"),
                E.td('string', SurfaceType.valueToString(group.type)),
            ),
        ];
    }

    /** Display info about a game object instance.
     *  @param {object} info The object info.
     *  @note `info.obj` should be a RomListEntry.
     */
    _showObject(info) {
        let   entry = info.entry;
        if(!entry) entry = info.obj.entry;
        if(!entry) entry = info.obj; //what the fuck
        const dll   = entry.object.dll;
        let   acts  = [];
        for(let iAct=1; iAct<16; iAct++) {
            if(entry.acts[iAct]) acts.push(iAct);
        }
        if(acts.length == 0) acts.push('none');
        else if(acts.length == 15) acts = ['all'];

        //XXX why are we getting no info.obj from the object list widget
        const wx = entry.position.x - info.obj ? (info.obj.map.worldX*MAP_CELL_SIZE) : 0;
        const wz = entry.position.z - info.obj ? (info.obj.map.worldZ*MAP_CELL_SIZE) : 0;

        const rows = [
            E.tr(E.th(null, `Object ID 0x${hex(entry.id, 8)}`,
                {colspan:2, title:`${entry.id}`})),
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
                E.td('hex objDefNo', `0x${hex(entry.defNo, 4)}`),
            ),
            E.tr(
                E.th(null, "Position"),
                E.td('vec3f objPos', `${entry.position.x.toFixed(2)}, ${entry.position.y.toFixed(2)}, ${entry.position.z.toFixed(2)}`),
            ),
            E.tr(
                E.th(null, "Global Pos"),
                E.td('vec3f objPos', `${wx.toFixed(2)}, ${entry.position.y.toFixed(2)}, ${wz.toFixed(2)}`),
            ),
            E.tr(
                E.th(null, "DLL"),
                E.td('dllId', `#0x${hex(entry.object.header.dll_id, 4)} `+
                    (dll ? dll.name : '-')),
            ),E.tr(
                E.th(null, "Acts"),
                E.td('string', acts.join(',')),
            ),E.tr(
                E.th(null, "Group"),
                E.td('int', entry.group),
            ),E.tr(
                E.th(null, "Category"),
                E.td('string', ObjCatId.valueToString(entry.object.header.catId)),
            ),
        ];
        //XXX tidy this
        const inst = this.mapViewer._objectRenderer.objInstancesById[entry.id];
        let params = inst.decodeParams();
        if(params == null) params = {};
        for(const [name, val] of Object.entries(params)) {
            rows.push(E.tr(
                E.th('objparam', name),
                E.td(null, val),
            ));
        }
        this._tbl.append(...rows);

        const data = entry.paramData;
        if(data && data.byteLength) {
            const words = [];
            for(let i=0x18; i<data.byteLength; i += 4) {
                words.push(hex(data.getUint32(i), 8));
            }
            this._tbl.append(E.tr('rawparams',
                E.th('objparam', "Raw Params"),
                E.td('hexdump', words.join(' ')),
            ));
        }
    }

    /** Display info about a WARPTAB entry.
     *  @param {object} info The warp info.
     */
    _showWarp(info) {
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
