import Game, {MAP_CELL_SIZE} from "../../../game/Game.js";
import { assertType } from "../../../Util.js";
import { E, clearElement } from "../../../lib/Element.js";
import { hex } from "../../../Util.js";
import Context from "../gl/Context.js";
import GX from "../gl/gx/GX.js";
import BlockRenderer from "./BlockRenderer.js";
import ViewController from "../gl/ui/ViewController.js";
import InputHandler from "../gl/ui/InputHandler.js";
import Grid from "./Grid.js";
import Stats from "./Stats.js";
import LayerChooser from "./LayerChooser.js";
import InfoWidget from "./InfoWidget.js";
import ObjectList from "./ObjectList.js";
import HelpBox from "./HelpBox.js";
import TextureViewer from "./TextureViewer.js";
import RenderBatch from "../gl/gx/RenderBatch.js";
import ObjectRenderer from "./ObjectRenderer.js";
import { makeCube, makeBox } from "../gl/GlUtil.js";
import Arrow from "../gl/Model/Arrow.js";
import Axes from "../gl/Model/Axes.js";
import MapExporter from "./MapExporter.js";

/** Renders map geometry. */
export default class MapViewer {
    constructor(game) {
        this.game          = assertType(game, Game);
        this.app           = game.app;
        this.element       = document.getElementById('tab-mapView');
        this.canvas        = E.canvas('map-view-canvas');
        this.context       = null;
        this.eMapList      = null;
        this.map           = null; //current map
        this.curBlock      = null;
        this._targetObj    = null;
        this.grid          = new Grid(this);
        this.stats         = new Stats(this);
        this.layerChooser  = new LayerChooser(this);
        this.infoWidget    = new InfoWidget(this);
        this.objectList    = new ObjectList(this);
        this.helpBox       = new HelpBox(this);
        this.textureViewer = new TextureViewer(this);
        this.eLeftSidebar  = E.div('sidebar sidebar-left');
        this.eRightSidebar = E.div('sidebar sidebar-right');
        this._inputHandler = new InputHandler(this);
        this._setupKeyEvents();
        this._reset();
        this.app.onIsoLoaded(iso => this._onIsoLoaded());
        this._isLoading = false;
    }

    _setupKeyEvents() {
        const H = this._inputHandler;
        const C = this.layerChooser;
        this._inputHandler.onKeyEvent('KP_8_Press', (code, event) => {
            //put camera at top looking down or something
        });
        this._inputHandler.onKeyEvent('g_Press', (code, event) => {
            C.toggleLayer('waterGeometry');
        });
        this._inputHandler.onKeyEvent('b_Press', (code, event) => {
            C.toggleLayer('blockBounds');
        });
        this._inputHandler.onKeyEvent('h_Press', (code, event) => {
            C.toggleLayer('hiddenGeometry');
        });
        this._inputHandler.onKeyEvent('m_Press', (code, event) => {
            C.toggleLayer('mainGeometry');
        });
        this._inputHandler.onKeyEvent('t_Press', (code, event) => {
            C.toggleLayer('reflectiveGeometry');
        });
        this._inputHandler.onKeyEvent('p_Press', (code, event) => {
            C.toggleLayer('warps');
        });
    }

    /** Move the camera to show the given object.
     *  @param {RomListEntry} entry Object to show.
     */
    showObject(entry) {
        //ensure at least one act containing this object is visible.
        let visible = false, actNo = null;
        for(let [i,act] of Object.entries(entry.acts)) {
            if(act) {
                if(this.layerChooser.getLayer(`act${i}`)) {
                    visible = true;
                    break;
                }
                else if(actNo == null) actNo = i;
            }
        }
        if(actNo != null) this.layerChooser.setLayer(`act${actNo}`, true, false);

        //ensure the object group is visible.
        //this will redraw the map (last param is true)
        this.layerChooser.setLayer(`group${entry.group}`, true, true);

        //XXX if the object is a trigger/curve, enable those.

        this.moveToObject(entry);
        this.infoWidget.show({type:'object', obj:entry});
    }

    /** Set up the map viewer. */
    _onIsoLoaded() {
        this._buildControls();
        clearElement(this.element).append(
            this.eControls,
            this.canvas,
            this.eLeftSidebar,
            this.eRightSidebar,
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
        this.eLeftSidebar.append(
            this.viewController.element,
            this.layerChooser.element,
            this.infoWidget.element,
            this.stats.element,
        );
        this.eRightSidebar.append(
            this.helpBox.element,
            this.grid.element,
            this.objectList.element,
            this.textureViewer.element,
        );

        this._blockRenderer  = new BlockRenderer(this, this.gx);
        this._objectRenderer = new ObjectRenderer(this);
        this.context.canvas.focus();
        this.context.camResetFunc = () => {
            this.resetCamera();
            return true; //redraw
        };
        this._reset();
    }

    /** Build the map list widget. */
    _buildMapList() {
        this.eMapList = E.select({id:'mapview-map-list'});
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
        this.eMapList.addEventListener('change', e => this._reset());
    }

    /** Build the Export button. */
    _buildExportButton() {
        const btn = E.button('export-file', 'Export');
        btn.addEventListener('click', e => this._exportMap());
        return btn;
    }

    /** Build the controls above the context. */
    _buildControls() {
        this._buildMapList();
        this.eControls = E.div('controls',
            E.label(null, {For:'mapview-map-list'}, "Map:"),
            this.eMapList,
            this._buildExportButton(),
        );
        return this.eControls;
    }

    /** Reset viewer to display another map. */
    _reset() {
        this._batches = [];
        this._isFirstDrawAfterLoadingMap = true;

        if(!this.context) return; //don't start if not initialized
        //don't start until user actually picks a map
        if(this.eMapList.value == 'null') return;
        this.game.unloadTextures();

        const map = this.game.maps[this.eMapList.value];
        if(!map) {
            console.error("Invalid map selected", this.eMapList.value);
            return;
        }

        console.log("Loading map", map);
        this.map = map;
        if(!map.dirName) {
            console.error("Map has no directory", map);
            //continue, so we can examine the romlists that
            //don't have any corresponding geometry.
        }

        this.viewController.set({
            enableTextures: true,
            useWireframe: false,
            enableBackfaceCulling: true,
            showPickBuffer: false,
            useOrtho: false,
            frontFaceCW: true,
            useSRT: true,
            zNear:2.5, zFar:10000, fov:60,
            scale: {x:1, y:1, z:1},
        });
        this.gx.resetPicker();
        this._objectRenderer.reset();
        this._blockRenderer.reset();
        this.curBlock = this._findABlock();
        this.layerChooser.refresh();
        this.objectList.refresh();
        this.grid.refresh();
        this.textureViewer.refresh();
        this.redraw();
        this._updatedStats = false;
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

    /** Load the map data. */
    async _loadMap() {
        this._isLoading = true; //don't draw before it's loaded
        this.app.progress.show({
            taskText:  "Loading Map",
            subText:   "Loading block textures...",
            stepsDone: 0,
            numSteps:  this.map.blocks.length,
        });

        //load block data
        for(let iBlock=0; iBlock < this.map.blocks.length; iBlock++) {
            const block = this.map.blocks[iBlock];
            if(!(iBlock & 0xF)) {
                await this.app.progress.update({stepsDone:iBlock});
            }
            if(block && block.mod < 0xFF) block.load(this.gx);
        }

        //load object data
        await this._objectRenderer.loadObjects();

        //build set of all map textures for texture viewer
        const textures = {};
        for(let iBlock=0; iBlock < this.map.blocks.length; iBlock++) {
            const block = this.map.blocks[iBlock];
            if(!(block && block.textures)) continue;
            for(let tex of block.textures) {
                textures[tex.gameTexture.id] = tex;
            }
        }
        this.textureViewer.setTextures(textures);
        this._isLoading = false;
    }

    /** Find a block to start at. */
    _findABlock() {
        if(!this.map.blocks) {
            console.error("Map has no blocks", this.map);
            return null;
        }
        //if there's one at the origin, prefer it.
        let block = this.map.getBlock(0, 0);
        console.assert(this.gx);
        console.assert(this.gx.context);
        if(block && block.load(this.gx)) return block;

        //find the first non-empty, non-missing block.
        let iBlock = 0;
        while(iBlock < this.map.blocks.length) {
            if(this.map.blocks[iBlock]
            && this.map.blocks[iBlock].mod < 0xFF
            && this.map.blocks[iBlock].load(this.gx)) break;
            iBlock++;
        }
        block = this.map.blocks[iBlock];
        if(!block) {
            //console.error("Map has no blocks", this.map);
            return null;
        }
        return block;
    }

    /** Signal the map viewer to redraw. */
    async redraw() {
        if(this._pendingDraw) return;
        this._pendingDraw = true;
        if(this._isFirstDrawAfterLoadingMap) await this._loadMap();

        window.requestAnimationFrame(() => {
            this._pendingDraw = false;
            this.grid.refresh();
            this.context.redraw();
            //this.stats.refresh();
            if(!this._updatedStats) {
                this._updatedStats = true;
                this.stats.refresh();
            }
            if(this._isFirstDrawAfterLoadingMap) {
                this._isFirstDrawAfterLoadingMap = false;
                this.app.progress.hide();
                this.resetCamera();
            }
        });
    }

    /** Move the camera to an appropriate starting position. */
    resetCamera() {
        let x = this.map.originX * MAP_CELL_SIZE;
        let y = 0;
        let z = this.map.originZ * MAP_CELL_SIZE;
        let rx = 0;
        let radius = 1;
        if(this.curBlock && this.curBlock.header) { //XXX use origin block if any
            y = this.curBlock.header.yOffset;
        }

        //if we have a setup point, use that. just take the first one.
        if(this.map.romList) {
            for(let entry of this.map.romList.entries) {
                if(entry.defNo == 0xD) { //setuppoint
                    //console.log("setupppoint", entry);
                    x = entry.position.x;
                    y = entry.position.y + 100;
                    z = entry.position.z;
                    radius = 20;
                    rx = (entry.params.rotX.value.value / 256) * Math.PI;
                    break;
                }
            }
        }

        if(isNaN(x) || x == null) x = 0;
        if(isNaN(y) || y == null) y = 0;
        if(isNaN(z) || z == null) z = 0;
        this.viewController.moveToPoint(x, y, z, radius, 0, rx);
    }

    /** Move the camera to an object.
     *  @param {RomListEntry} obj Object to move to.
     */
    moveToObject(obj) {
        this.viewController.moveToPoint(
            obj.position.x, obj.position.y, obj.position.z,
            Math.max(obj.object.scale, 10) * 10);
    }

    clearTarget() {
        this._targetObj = null;
    }

    /** Draw the map. Called by Context. */
    async _draw(isPicker) {
        if(!this.map) return;
        if(this._isLoading) return;
        this._isDrawingForPicker = isPicker;

        //const tStart = performance.now();
        const LC = this.layerChooser;
        const blockStreams = [
            ['main',       LC.getLayer('mainGeometry')],
            ['reflective', LC.getLayer('reflectiveGeometry')],
            ['water',      LC.getLayer('waterGeometry')],
        ];

        const blockStats = {totals:{}};
        const wasWireframe = this.gx.context.useWireframe;
        this._beginRender();
        this.gx.context.useWireframe = false;
        if(LC.getLayer('origin')) this._drawOrigin();

        this.gx.context.useWireframe = wasWireframe;
        this._drawBlocks(blockStats, blockStreams);

        this.gx.context.useWireframe = false;
        if(LC.getLayer('blockHits')) this._drawBlockHits();
        await this._drawObjects();
        if(LC.getLayer('warps')) this._drawWarps();
        if(LC.getLayer('hitPolys')) this._drawHitPolys();
        if(LC.getLayer('polyGroups')) this._drawPolyGroups();
        if(LC.getLayer('blockBounds')) this._drawBlockBounds();
        this.gx.context.useWireframe = wasWireframe;
        this._finishRender(blockStats, blockStreams);
        //console.log("block render OK", this.gx.context.stats);
        //console.log("GX logs:", this.gx.program.getLogs());
        //if(isPicker) console.log("picker IDs", this.gx.pickerObjs);
    }

    /** Set up to render a frame. */
    _beginRender() {
        //const gl = this.gx.gl;
        if(!this.curBlock) {
            this.curBlock = this._findABlock();
            //if(!this.curBlock) return;
            //we can still render, in case there are objects
        }

        //console.log("map block", this.curBlock);
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
    _finishRender(blockStats, blockStreams) {
        this.gx.finishRender();
        blockStats.streamTimes = {};
        const tEnd = performance.now();
        for(const [name, stream] of blockStreams) {
            blockStats.streamTimes[name] = 0;
            for(let iBlock=0; iBlock < this.map.blocks.length; iBlock++) {
                const obj = blockStats[name][iBlock];
                if(!obj) continue;
                blockStats.streamTimes[name] += obj.renderTime;
                for(const [k,v] of Object.entries(obj)) {
                    if(isNaN(v)) continue;
                    if(blockStats.totals[k] == undefined) blockStats.totals[k] = v;
                    else blockStats.totals[k] += v;
                }
            }
        }
        //console.log("Render msec:", tEnd-tStart, "stats:", blockStats);
        this.stats.updateDrawCounts(blockStats);
    }

    /** Draw the map's origin. */
    _drawOrigin() {
        const params = {
            isPicker: this._isDrawingForPicker,
        };
        const batch = this._getBatch('origin', params);
        if(batch.isEmpty) {
            batch.addFunction(
                (new Axes(this.gx,[
                    this.map.originX*MAP_CELL_SIZE, 0,
                    this.map.originZ*MAP_CELL_SIZE
                ], [0,0,0], [320,320,320])).batch);
        }
        this.gx.executeBatch(batch);
    }

    /** Draw the map geometry. */
    _drawBlocks(blockStats, blockStreams) {
        const params = {
            showHidden: this.layerChooser.getLayer('hiddenGeometry'),
            isGrass:    false, //draw the grass effect instead of the geometry
            isPicker:   this._isDrawingForPicker,
            dlist:      this.layerChooser.eWhichList.value,
        };
        const showAll = !this.grid.eChkOnlyCur.checked;
        for(const [name, stream] of blockStreams) {
            blockStats[name] = [];
            for(let iBlock=0; iBlock < this.map.blocks.length; iBlock++) {
                const block = this.map.blocks[iBlock];
                if(!block || (block.mod >= 0xFF) || !block.load()) continue;
                if(!(showAll || block == this.curBlock)) continue;
                let batch = null;
                if(stream) batch = this._drawBlock(block, params, name);
                this.gx.context.stats.renderTime = performance.now() -
                    this.gx.context.stats.renderStartTime;
                this.gx.context.stats.block = block;
                this.gx.context.stats.batch = batch;
                blockStats[name].push(this.gx.context.stats);
                this.gx.context.resetStats();
            }
        }
    }

    /** Draw one map block. */
    _drawBlock(block, params, stream) {
        const gl = this.gx.gl;
        block.load(this.gx); //ensure block model is loaded

        const offsX = (block.x-this.map.originX)*MAP_CELL_SIZE;
        const offsY = block.header.yOffset;
        const offsZ = (block.z-this.map.originZ)*MAP_CELL_SIZE;
        let mv = mat4.clone(this.gx.context.matModelView);
        mat4.translate(mv, mv, vec3.fromValues(offsX, offsY, offsZ));
        this.gx.setModelViewMtx(mv);

        const batch = this._blockRenderer.render(block, stream, params);
        if(batch) { //there was in fact a block to render
            const gb = this.gx.context.stats.geomBounds;
            gb.xMin = Math.min(gb.xMin, batch.geomBounds.xMin+offsX);
            gb.xMax = Math.max(gb.xMax, batch.geomBounds.xMax+offsX);
            gb.yMin = Math.min(gb.yMin, batch.geomBounds.yMin+offsY);
            gb.yMax = Math.max(gb.yMax, batch.geomBounds.yMax+offsY);
            gb.zMin = Math.min(gb.zMin, batch.geomBounds.zMin+offsZ);
            gb.zMax = Math.max(gb.zMax, batch.geomBounds.zMax+offsZ);
        }
        return batch; //for stats
    }

    /** Draw the hit lines for each block. */
    _drawBlockHits() {
        const gx = this.gx;
        const gl = this.gx.gl;
        const params = {
            isPicker: this._isDrawingForPicker,
        };
        const batch = this._getBatch('blockHits', params);
        if(batch.isEmpty) {
            const batches = [];
            if(!this._isDrawingForPicker) batch.addFunction(() => {
                //blending on, face culling off
                gx.disableTextures(GX.BlendMode.BLEND, false);
            });
            else batch.addFunction(() => {
                //blending off, face culling off
                gx.disableTextures(GX.BlendMode.NONE, false);
            });
            for(let iBlock=0; iBlock < this.map.blocks.length; iBlock++) {
                const block = this.map.blocks[iBlock];
                if(!block || (block.mod >= 0xFF)) continue;
                const batch = this._blockRenderer.renderHits(block, params);
                if(batch) batches.push(batch);
            }
            batch.addBatches(...batches);
        }
        this.gx.executeBatch(batch);
    }

    /** Draw the bounding boxes for each block. */
    _drawBlockBounds() {
        const gx = this.gx;
        const gl = this.gx.gl;
        if(this._isDrawingForPicker) return;

        const params = {
            isPicker: this._isDrawingForPicker,
        };
        const batch = this._getBatch('blockBounds', params);
        if(batch.isEmpty) {
            const ox = this.map.originX;
            const oz = this.map.originZ;
            batch.addFunction(() => {
                //blend on, face culling off
                gx.disableTextures(GX.BlendMode.BLEND, false);
                gx.setModelViewMtx(mat4.clone(gx.context.matModelView));
            });
            for(let iBlock=0; iBlock < this.map.blocks.length; iBlock++) {
                const block = this.map.blocks[iBlock];
                if(!block || (block.mod >= 0xFF)) continue;

                //top left
                const x1 = ((block.x-ox) * MAP_CELL_SIZE);
                const y1 = (block && block.header) ? block.header.yMax :  1;
                const z1 = (block.z-oz) * MAP_CELL_SIZE;

                //bottom right
                const x2 = ((block.x-ox)+1) * MAP_CELL_SIZE;
                const y2 = (block && block.header) ? block.header.yMin : -1;
                const z2 = ((block.z-oz)+1) * MAP_CELL_SIZE;

                batch.addVertices(...makeBox(gl,
                    [x1,y1,z1], [x2,y2,z2], -1, 0x80));
            }
        }
        this.gx.executeBatch(batch);
        return batch;
    }

    /** Draw WARPTAB entries. */
    _drawWarps() {
        const gx = this.gx;
        const gl = this.gx.gl;

        const params = {
            isPicker: this._isDrawingForPicker,
        };
        const batch = this._getBatch('warps', params);
        if(batch.isEmpty) {
            if(this._isDrawingForPicker) batch.addFunction(() => {
                //blend off, face culling off
                gx.disableTextures(GX.BlendMode.NONE, false);
                gx.setModelViewMtx(mat4.clone(gx.context.matModelView));
            });
            else batch.addFunction(() => {
                //blend on, face culling off
                gx.disableTextures(GX.BlendMode.BLEND, false);
                gx.setModelViewMtx(mat4.clone(gx.context.matModelView));
            });
            for(let [idx, warp] of Object.entries(this.game.warpTab)) {
                const map = this.game.getMapAt(
                    warp.layer, warp.pos.x, warp.pos.z);
                if(map != this.map) continue;
                const id = this.gx.addPickerObj({
                    type: 'warp',
                    warp: warp,
                    idx:  idx,
                });
                const x = warp.pos.x - (this.map.worldX*MAP_CELL_SIZE);
                const y = warp.pos.y;
                const z = warp.pos.z - (this.map.worldZ*MAP_CELL_SIZE);
                const r = (warp.xRot / 32768) * Math.PI;
                const pos = [x,y,z];
                const rot = [0,r,0];
                const scale = [10,10,10];
                batch.addFunction(
                    (new Arrow(gx,pos,rot,scale))
                    .setColor(0x00,0x80,0xFF,0xC0)
                    .batch);
                console.log("add warp", hex(idx), x, y, z, "orig", warp.pos);
            }
        }
        this.gx.executeBatch(batch);
    }

    /** Draw object positions. */
    async _drawObjects() {
        let mv = mat4.clone(this.gx.context.matModelView);
        /*mat4.translate(mv, mv, vec3.fromValues(
            (this.map.originX * MAP_CELL_SIZE), 0,
            (this.map.originZ * MAP_CELL_SIZE) ));*/
        this.gx.setModelViewMtx(mv);
        const batch = await this._objectRenderer.drawObjects(
            this.layerChooser.getActs(), this._isDrawingForPicker);
        if(batch) this.gx.executeBatch(batch);
    }

    /** Draw hit detect polygons. */
    _drawHitPolys() {
        const gx = this.gx;

        const params = {
            isPicker: this._isDrawingForPicker,
        };
        const batch = this._getBatch('blockHitPolys', params);
        if(batch.isEmpty) {

            batch.addFunction(() => {
                //blending on, face culling off
                gx.disableTextures(GX.BlendMode.BLEND, false);
            });
            const batches = [];
            for(let iBlock=0; iBlock < this.map.blocks.length; iBlock++) {
                const block = this.map.blocks[iBlock];
                if(!block || (block.mod >= 0xFF) || !block.polygons) continue;
                batches.push(this._blockRenderer.renderCollisionMesh(
                    block, params));
            }
            batch.addBatches(...batches);
        }
        gx.executeBatch(batch);
    }

    /** Draw poly group bounds. */
    _drawPolyGroups() {
        const gx = this.gx;
        const params = {
            isPicker: this._isDrawingForPicker,
        };
        const batch = this._getBatch('blockPolyGroups', params);
        if(batch.isEmpty) {
            if(!this._isDrawingForPicker) batch.addFunction(() => {
                //blending on, face culling off
                gx.disableTextures(GX.BlendMode.BLEND, false);
            });
            else batch.addFunction(() => {
                //blending off, face culling off
                gx.disableTextures(GX.BlendMode.NONE, false);
            });

            const batches = [];
            for(let iBlock=0; iBlock < this.map.blocks.length; iBlock++) {
                const block = this.map.blocks[iBlock];
                if(!block || (block.mod >= 0xFF) || !block.polyGroups) continue;
                batches.push(this._blockRenderer.renderPolyGroups(block, params));
            }
            batch.addBatches(...batches);
        }
        gx.executeBatch(batch);
    }

    /** Get object at given screen coords.
     *  @param {integer} x X coordinate relative to canvas.
     *  @param {integer} y Y coordinate relative to canvas.
     *  @returns {object} Dict explaining what's at this coordinate,
     *   or null.
     */
    async _getObjAt(x, y) {
        const id = await this.gx.context.readPickBuffer(x, y);
        let   obj = this.gx.getPickerObj(id);
        if(obj == undefined) obj = null;
        if(obj) console.log("pick", x, y, hex(id,8), id, obj);
        return obj;
    }

    /** Export the map to a DAE file. */
    async _exportMap() {
        (new MapExporter(this.game, this.gx, this.map)).export();
    }
}
