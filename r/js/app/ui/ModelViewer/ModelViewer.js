import Game from "../../../game/Game.js";
import { assertType } from "../../../Util.js";
import { E, clearElement } from "../../../lib/Element.js";
import { hex } from "../../../Util.js";
import Context from "../gl/Context.js";
import GX from "../gl/gx/GX.js";
import ModelRenderer from './ModelRenderer.js';
import ViewController from "../gl/ui/ViewController.js";
import TextureViewer from "../MapViewer/TextureViewer.js";

const PI_OVER_180 = Math.PI / 180.0; //rad = deg * PI_OVER_180
const DEG2RAD = (x) => (x*PI_OVER_180);
const RAD2DEG = (x) => (x/PI_OVER_180);

export default class ModelViewer {
    /** Renders object models. */
    constructor(game) {
        this.game          = assertType(game, Game);
        this.app           = game.app;
        this.element       = document.getElementById('tab-modelView');
        this.canvas        = E.canvas('model-view-canvas');
        this.context       = null;
        this.eLeftSidebar  = E.div('sidebar sidebar-left');
        this.eRightSidebar = E.div('sidebar sidebar-right');
        this._reset();

        //disable model viewer for now because lol canvas shit
        this.app.onIsoLoaded(iso => this._onIsoLoaded());

        this.textureViewer = new TextureViewer(this);
    }

    _onIsoLoaded() {
        /** Set up the model viewer. */
        this._buildControls();
        clearElement(this.element).append(
            this.eControls,
            this.canvas,
            this.eLeftSidebar,
            this.eRightSidebar,
        )
        if(!this.context) this._initContext();
    }

    async _initContext() {
        /** Set up the GL context. */
        if(this.context) return;
        this.context = new Context(this.canvas,
            (isPicker) => this._draw(isPicker));
        await this.context.init();
        console.log("GL ctx init OK");

        this.gx = new GX(this.context);
        await this.gx.loadPrograms();

        this.viewController = new ViewController(this.context);
        this.eLeftSidebar.append(
            this.viewController.element,
            //this.layerChooser.element,
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
        this.context.camResetFunc = () => {
            this.resetCamera();
            return true; //redraw
        };
        this._reset();
    }

    _buildControls() {
        /** Build the controls above the context. */
        this.eControls = E.div('controls',
            //...
        );
        return this.eControls;
    }

    _reset() {
        /** Reset viewer to display another model. */
        this._batches = [];
        this._isFirstDrawAfterLoadingModel = true;

        if(!this.context) return; //don't start if not initialized
        //don't start until user actually picks a model
        //if(this.eMapList.value == 'null') return;
        this.game.unloadModels();

        //const model = this.game.maps[this.eMapList.value];
        //negative 0x4E8 is Krystal, positive is placeholder cube
        const model = this.game.loadModel(this.gx, -0x4E8, '/warlock');
        //const model = this.game.loadModel(this.gx, 0x4E8, '/warlock');
        if(!model) {
            //console.error("Invalid model selected", this.eMapList.value);
            return;
        }
        this.model = model;
        this._modelRenderer.parse(this.model);

        this.viewController.set({
            enableTextures: true,
            useWireframe: false,
            enableBackfaceCulling: true,
            showPickBuffer: false,
            useOrtho: false,
            frontFaceCW: true,
            useSRT: false,
        });
        this.gx.resetPicker();
        this.textureViewer.refresh();
        this.redraw();
        this._updatedStats = false;
    }

    async redraw() {
        /** Signal the model viewer to redraw. */
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
                this.resetCamera();
            }
        });
    }

    resetCamera() {
        /** Move the camera to an appropriate starting position. */
        //this.viewController.set({
        //    pos: {x:10000, y:10000, z:10000},
        //});
        let x = 0;
        let y = 0;
        let z = 0;
        let rx = DEG2RAD(180);
        let radius = Math.max(50, this.model.radi);
        this.viewController.moveToPoint(x, y, z, radius, 0, rx);
    }

    clearTarget() {
        //nothing to do here for now
    }

    async _draw(isPicker) {
        /** Draw the model. Called by Context. */
        if(!this.model) return;

        this._isDrawingForPicker = isPicker;

        //const tStart = performance.now();
        //const LC = this.layerChooser;
        this._beginRender();
        this._modelRenderer.render(this.model, {
            dlist: -1,
        });
        //if(LC.getLayer('origin')) this._drawOrigin();
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

    _beginRender() {
        /** Set up to render a frame. */
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

    _finishRender() {
        /** Finish rendering and record stats. */
        //console.log("finished render", this.gx.context.stats);
    }
}
