import Game from "../../../game/Game.js";
import { assertType } from "../../../Util.js";
import { E, clearElement } from "../../../lib/Element.js";
import { hex } from "../../../Util.js";
import Context from "../gl/Context.js";
import GX from "../gl/gx/GX.js";
import RenderBatch from "../gl/gx/RenderBatch.js";
import ModelRenderer from './ModelRenderer.js';
import LayerChooser from './LayerChooser.js';
import ViewController from "../gl/ui/ViewController.js";
import InputHandler from "../gl/ui/InputHandler.js";
import TextureViewer from "../MapViewer/TextureViewer.js";
import Axes from "../gl/Model/Axes.js";

const PI_OVER_180 = Math.PI / 180.0; //rad = deg * PI_OVER_180
const DEG2RAD = (x) => (x*PI_OVER_180);
const RAD2DEG = (x) => (x/PI_OVER_180);

/** Renders object models. */
export default class ModelViewer {
    constructor(game) {
        this.game          = assertType(game, Game);
        this.app           = game.app;
        this.layerChooser  = new LayerChooser(this);
        this.element       = document.getElementById('tab-modelView');
        this.canvas        = E.canvas('model-view-canvas');
        this.context       = null;
        this.eLeftSidebar  = E.div('sidebar sidebar-left');
        this.eRightSidebar = E.div('sidebar sidebar-right');
        this._inputHandler = new InputHandler(this);
        this.textureViewer = new TextureViewer(this);
        this._reset();
        this.app.onIsoLoaded(iso => this._onIsoLoaded());
    }

    _getBatch(name, params) {
        let key = [name];
        for(const [k,v] of Object.entries(params)) {
            key.push(`${k}:${v}`);
        }
        key = key.join(',');
        let batch = this._batches[key];
        if(!batch) {
            batch = new RenderBatch(this.gx);
            this._batches[key] = batch;
        }
        return batch;
    }

    /** Set up the model viewer. */
    _onIsoLoaded() {
        this._buildControls();
        clearElement(this.element).append(
            this.eControls,
            this.canvas,
            this.eLeftSidebar,
            this.eRightSidebar,
            this.eError,
        )
        if(!this.context) this._initContext();
    }

    /** Set up the GL context. */
    async _initContext() {
        if(this.context) return;
        this.context = new Context(this.canvas,
            (isPicker) => this._draw(isPicker));
        await this.context.init();
        console.log("GL ctx init OK");

        this.gx = new GX(this.context);
        await this.gx.loadPrograms();

        this.viewController = new ViewController(this.context);
        this.viewController._resetHandler = () => {this._resetView()};
        this.eLeftSidebar.append(
            this.viewController.element,
            this.layerChooser.element,
            //this.infoWidget.element,
            //this.stats.element,
        );
        this.eRightSidebar.append(
            //this.helpBox.element,
            //this.grid.element,
            //this.objectList.element,
            this.textureViewer.element,
        );

        this._modelRenderer = new ModelRenderer(this, this.gx);
        this.context.canvas.focus();
        this._reset();
    }

    /** Build the controls above the context. */
    _buildControls() {
        this._buildMapList();
        this._buildModelList();

        this.eError = E.div('error popup', {id: 'modelview-error'},
            E.h1(null, "Render Failed"),
            E.span(null, "..."),
        );

        this.eControls = E.div('controls',
            E.label(null, {For:'modelview-map-list'}, "Map:"),
            this.eMapList,
            E.label(null, {For:'modelview-model-list'}, "Model:"),
            this.eModelList,
        );
        return this.eControls;
    }

    /** Build the map list widget. */
    _buildMapList() {
        //XXX mostly copied from map viewer
        this.eMapList = E.select({id:'modelview-map-list'});
        const maps = [];
        for(let [id, map] of Object.entries(this.game.maps)) {
            maps.push({id:id, map:map});
        }
        maps.sort((a, b) => { //sort by name, falling back to ID
            let nA = a.map.name;
            let nB = b.map.name;
            if(!nA) nA = `\x7F${a.id}`;
            if(!nB) nB = `\x7F${b.id}`;
            if(nA == nB) return 0;
            return (nA < nB) ? -1 : 1;
        });
        this.eMapList.append(E.option(null, "(no map selected)", {value:'null'}));
        for(let map of maps) { //build list with placeholder names as needed
            let name = map.map.name;
            if(!name) name = "(no name)";
            let id = map.id;
            if(isNaN(id)) id = '??';
            else id = hex(id,2);
            this.eMapList.append(E.option(null, `${id} ${name}`,
                {value:map.id}));
        }
        this.eMapList.addEventListener('change', e => this._changeMap());
    }

    /** Build the map list widget. */
    _buildModelList() {
        this.eModelList = E.select({id:'modelview-model-list'});
        this.eModelList.addEventListener('change', e => this._reset());
    }

    /** Load a different map. */
    _changeMap() {
        if(this.eMapList.value == 'null') return;
        const map = this.game.maps[this.eMapList.value];
        if(!map) {
            console.error("Invalid map selected", this.eMapList.value);
            return;
        }

        clearElement(this.eModelList);
        const ids = map.getModels();
        if(ids == null) return;
        for(const id of ids) {
            const dispId = isNaN(id) ? '????' : hex(id,4);
            this.eModelList.append(E.option(null, `${dispId}`, {value:id}));
        }
        this._reset();
    }

    /** Reset viewer to display another model. */
    _reset() {
        this._batches = [];
        this._isFirstDrawAfterLoadingModel = true;

        if(!this.context) return; //don't start if not initialized
        //don't start until user actually picks a model
        if(this.eMapList.value == 'null') return;
        this.game.unloadModels();
        this.game.unloadTextures();
        this.gx.resetTextures();

        this.eError.style.display = 'none';

        const map = this.game.maps[this.eMapList.value];
        if(!map) {
            const title = this.eError.firstElementChild;
            title.nextElementSibling.innerText = "Invalid map selected";
            this.eError.style.display = 'block';
            return;
        }
        const modelNo = this.eModelList.value;

        //const model = this.game.maps[this.eMapList.value];
        //negative 0x4E8 is Krystal, positive is placeholder cube
        //the game always negates the model numbers from the object
        //file, but apparently sometimes they're negative already?
        let model;
        try {
            model = this.game.loadModel(this.gx, -modelNo, `/${map.dirName}`);
            //const model = this.game.loadModel(this.gx, 0x4E8, '/warlock');
            if(!model) throw "Invalid model selected";

            this.model = model;
            this._modelRenderer.reset();
            this._modelRenderer.parse(this.model);
            this._resetView();
            this.gx.resetPicker();

            const textures = {};
            for(let tex of this.model.textures) {
                textures[tex.gameTexture.id] = tex;
            }
            this.textureViewer.setTextures(textures);
            //this.textureViewer.refresh();

            this.redraw();
            this._updatedStats = false;
        }
        catch(ex) {
            console.error(ex);
            const title = this.eError.firstElementChild;
            title.nextElementSibling.innerText = String(ex);
            this.eError.style.display = 'block';
        }
    }

    _resetView() {
        this.viewController.set({
            enableTextures: true,
            useWireframe: false,
            enableBackfaceCulling: true,
            showPickBuffer: false,
            useOrtho: false,
            frontFaceCW: true,
            useSRT: false,
            zNear:2.5, zFar:10000, fov:60,
            scale: {x:1, y:1, z:1},
            rot: {x:0, y:180, z:0},
            pos: {x:0, y:0, z:128},
        });
    }

    /** Signal the model viewer to redraw. */
    async redraw() {
        if(this._pendingDraw) return;
        this._pendingDraw = true;
        //if(this._isFirstDrawAfterLoadingModel) await this._loadMap();

        window.requestAnimationFrame(() => {
            this._pendingDraw = false;
            //this.grid.refresh();
            this.context.redraw();
            //this.stats.refresh();
            //if(!this._updatedStats) {
            //    this._updatedStats = true;
            //    this.stats.refresh();
            //}
            if(this._isFirstDrawAfterLoadingModel) {
                this._isFirstDrawAfterLoadingModel = false;
                this.app.progress.hide();
                this._resetView();
                this.textureViewer.refresh();
            }
        });
    }

    clearTarget() {
        //nothing to do here for now
    }

    /** Draw the model. Called by Context. */
    async _draw(isPicker) {
        if(!this.model) return;

        this._isDrawingForPicker = isPicker;

        //const tStart = performance.now();
        const LC = this.layerChooser;
        this._beginRender();
        if(LC.isLayerEnabled('geometry')) {
            this._modelRenderer.render(this.model, {
                dlist: -1,
            });
        }

        if(LC.isLayerEnabled('origin')) this._drawOrigin();
        //this._drawBlocks(blockStats, blockStreams);
        //if(LC.getLayer('blockHits')) this._drawBlockHits();
        //await this._drawObjects();
        //if(LC.getLayer('warps')) this._drawWarps();
        //if(LC.getLayer('hitPolys')) this._drawHitPolys();
        //if(LC.getLayer('polyGroups')) this._drawPolyGroups();
        //if(LC.getLayer('blockBounds')) this._drawBlockBounds();
        this._finishRender();
        //console.log("block render OK", this.gx.context.stats);
        //console.log("GX logs:", this.gx.program.getLogs());
        //if(isPicker) console.log("picker IDs", this.gx.pickerObjs);
    }

    /** Set up to render a frame. */
    _beginRender() {
        //const gl = this.gx.gl;
        const ctx = this.gx.context;
        const mtxs = {
            projection: ctx.matProjection,
            modelView:  ctx.matModelView,
            normal:     ctx.matNormal,
        };

        this.gx.context.resetStats();
        this.gx.reset();
        this.gx.beginRender(mtxs, this._isDrawingForPicker);
    }

    /** Finish rendering and record stats. */
    _finishRender() {
        this.gx.finishRender();
        //console.log("finished render", this.gx.context.stats);
    }

    /** Draw the model's origin. */
    _drawOrigin() {
        const params = {
            isPicker: this._isDrawingForPicker,
        };
        const batch = this._getBatch('origin', params);
        if(batch.isEmpty) {
            batch.addFunction(
                (new Axes(this.gx,
                    [0, 0, 0], [0,0,0], [320,320,320])).batch);
        }
        this.gx.executeBatch(batch);
    }
}
