import RenderBatch from "../gl/gx/RenderBatch.js";
import GX from "../gl/gx/GX.js";
import createObjInstance from "./ObjInstance/createObjInstance.js";
import { Trigger } from "./ObjInstance/Trigger.js";
import Curve from "./ObjInstance/Curve.js";

/** Handles object rendering for map viewer. */
export default class ObjectRenderer {
    constructor(mapViewer) {
        this.mapViewer = mapViewer;
        this.game = mapViewer.game;
        this.app = this.mapViewer.app;
        this.gx = this.mapViewer.gx;
        this.reset();
    }

    /** Reset state for new map. */
    reset() {
        //keep track of picker IDs assigned to objects
        //so we don't keep making up new ones
        this.pickerIds = {}; //entry idx => picker ID

        //cache created batches
        this.batches = {}; //key => batch
    }

    /** Load object models and prepare batches. */
    async loadObjects() {
        const map = this.mapViewer.map;
        if(!map.romList) return; //nothing to render

        this.objInstancesById = {};
        this.objInstances = [];
        for(let i=0; i<map.romList.entries.length; i++) {
            if(!(i & 0xF)) {
                await this.app.progress.update({
                    taskText:  "Loading Map",
                    subText:   "Decoding object models...",
                    stepsDone: i,
                    numSteps:  map.romList.entries.length,
                });
            }

            //pre-render the object
            const entry = map.romList.entries[i];
            const inst  = createObjInstance(this.gx, this.game, map, entry);
            this.objInstances.push(inst);
            this.objInstancesById[entry.id] = inst;
            this._renderObject(entry, inst);
        }
    }

    /** Draw all enabled objects.
     *  @param {number} act Bitflags of act numbers to draw.
     *  @param {boolean} isPicker Whether we're rendering for picker buffer.
     *  @returns {RenderBatch} Batch that renders the objects.
     */
    async drawObjects(acts, isPicker) {
        const gx = this.gx;
        const gl = this.gx.gl;
        this._isDrawingForPicker = isPicker;

        const showTrig = this.mapViewer.layerChooser.getLayer("triggers");
        const showCurv = this.mapViewer.layerChooser.getLayer("curves");
        const groups   = this.mapViewer.layerChooser.getGroups();
        const color    = this.mapViewer.layerChooser.getObjColorMode();
        const cacheKey = [isPicker, acts, groups, showTrig, showCurv,
            color].join(':');

        //if we already generated a batch, use it.
        if(this.batches[cacheKey]) return this.batches[cacheKey];

        //console.log("Creating object batch", cacheKey);
        const batch = new RenderBatch(this.gx);
        this.batches[cacheKey] = batch;

        if(acts == 0) return batch;
        const map = this.mapViewer.map;
        if(!map.romList) return batch; //nothing to render

        const objs = [];
        for(let entry of map.romList.entries) {
            if((entry.actsMask & acts) && (entry.groupMask & groups)) {
                const inst = this.objInstancesById[entry.id];
                const batch = this._renderObject(entry, inst);
                console.assert(batch, "Batch for object", entry, "is", batch);
                if(!batch) debugger;
                const isTrig = (inst instanceof Trigger);
                const isCurv = (inst instanceof Curve);
                if(isTrig && showTrig) objs.push(batch);
                else if(isCurv && showCurv) objs.push(batch);
                else if(!(isTrig || isCurv)) objs.push(batch);
            }
        }

        this._setupRenderParams(batch);
        batch.addBatches(...objs);

        return batch;
    }

    /** Draw an object, using the current color mode.
     *  @param {ObjInstance} inst Object to draw.
     *  @returns {RenderBatch} The render batch.
     */
    _renderObject(entry, objInstance) {
        const color = this.mapViewer.layerChooser.getObjColorMode();
        const key = `obj${entry.idx}:${color}`;
        if(this.batches[key]) return this.batches[key];

        objInstance.colorBy = color;
        let id = this.pickerIds[objInstance.entry.idx];
        if(id == undefined) {
            id = this.gx.addPickerObj({
                type: 'object',
                obj:  objInstance,
            });
            this.pickerIds[objInstance.entry.idx] = id;
        }
        const batch = objInstance.render(id);
        console.assert(batch, "Failed to render object", id, objInstance);
        this.batches[key] = batch;
        return batch;
    }

    /** Set up the render params to render objects.
     *  @param {RenderBatch} batch Batch to render to.
     */
    _setupRenderParams(batch) {
        const gx = this.gx;
        const gl = this.gx.gl;
        if(this._isDrawingForPicker) {
            batch.addFunction(() => {
                //blending off, face culling off
                gx.disableTextures(GX.BlendMode.NONE, false);
            });
        }
        else {
            batch.addFunction(() => {
                //blending on, face culling off
                gx.disableTextures(GX.BlendMode.BLEND, false);
            });
        }
    }
}
