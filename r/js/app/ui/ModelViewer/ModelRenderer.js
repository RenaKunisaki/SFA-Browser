import BitStreamReader from '../../../game/BitStreamReader.js';
import DlistParser from '../gl/gx/DlistParser.js';
import RenderBatch from '../gl/gx/RenderBatch.js';
import RenderStreamParser from '../../../game/model/RenderStreamParser.js';

export default class ModelRenderer {
    /** Renders character models. */
    constructor(modelViewer, gx) {
        this.modelViewer = modelViewer;
        this.game = modelViewer.game;
        this.gx = gx;
        this.gl = gx.gl;
        this.stream = new RenderStreamParser(gx);
        this.dlistParser = new DlistParser(gx);
        this.reset();
    }

    reset() {
        this.pickerIds = {}; //id => list
        this._batches  = {};
    }

    _getBatch(name, model, params) {
        const key = [name, model.id, params.isPicker ? 1 :0].join(',');
        let batch = this._batches[key];
        if(!batch) {
            batch = new RenderBatch(this.gx);
            this._batches[key] = batch;
        }
        return batch;
    }

    parse(model, params={}) {
        /** Parse the display lists.
         *  @param {SfaModel} model The model to render.
         *  @param {object} params Render parameters.
         *  @returns {RenderBatch} Parsed render batch.
         */
        //check if we already parsed this
        const key = ([
            model.id,
            params.isPicker ? 1 : 0,
            params.dlist,
        ]).join(',');
        if(this._batches[key]) return this._batches[key];

        console.log("Parsing model", model, params);

        params = Object.assign({}, params); //shallow copy
        params.isMap = false;
        const ops = new BitStreamReader(model.renderInstrs);
        this._batches[key] = this.stream.execute(
            model, ops, params);

        console.log("Parsed model", model, params);
        return this._batches[key];
    }

    render(model, params={}) {
        /** Render the model.
         *  @param {SfaModel} model The model to render.
         *  @param {object} params Render parameters.
         *  @returns {RenderBatch} The render batch.
         */
        this.curShaderIdx = null;
        this.curModel     = model;
        this.params       = params;
        const batch       = this.parse(model, params);
        if(batch) {
            //console.log("execute render batch", batch);
            this.gx.executeBatch(batch);
            //this.gx.gl.flush();
        }
        return batch;
    }
}
