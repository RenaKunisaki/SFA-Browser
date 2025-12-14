const PI_OVER_180 = Math.PI / 180.0; //rad = deg * PI_OVER_180

/** Handles keyboard/mouse events on a GL context. */
export default class InputHandler {
    /** Construct MouseHandler.
     *  @param {MapViewer, ModelViewer} viewer The
     *      viewer class managing the canvas.
     */
    constructor(viewer, options={}) {
        this.viewer = viewer;
        this.canvas = viewer.canvas;
        this._prevMousePos = [0, 0];
        this._mouseStartPos = null;
        this._deltaTick = 1000.0 / 30.0; // 30 fps
        this._keysDown  = {};
        this._callbacks = {};
        this._options   = options;
        if(this._options.scrollScale == undefined) this._options.scrollScale = 1;

        const canvas = this.canvas;
        canvas.addEventListener('mousemove', e => this._onMouseMove(e));
        canvas.addEventListener('mousedown', e => this._onMouseDown(e));
        canvas.addEventListener('mouseup', e => this._onMouseUp(e));
        canvas.addEventListener('wheel', e => this._onMouseWheel(e));
        //must disable context menu to be able to right-drag.
        //can still use alt+right to open it.
        canvas.addEventListener('contextmenu', e => {
            if(!e.altKey) e.preventDefault();
        });

        canvas.addEventListener('keydown', e => this._onKey(e, true));
        canvas.addEventListener('keyup', e => this._onKey(e, false));

        setInterval(() => { this._tick(); }, this._deltaTick);
    }

    onMouseDown(handler) {
        this._addCallback('onMouseDown', handler);
    }
    onMouseUp(handler) {
        this._addCallback('onMouseUp', handler);
    }
    onMouseMove(handler) {
        this._addCallback('onMouseMove', handler);
    }
    onMouseWheel(handler) {
        this._addCallback('onMouseWheel', handler);
    }
    onKeyEvent(evtName, handler) {
        this._addCallback(evtName, handler);
    }

    _addCallback(name, handler) {
        if(!this._callbacks[name]) {
            this._callbacks[name] = [];
        }
        this._callbacks[name].push(handler);
    }
    _doCallback(name, ...args) {
        const cb = this._callbacks[name];
        if(!cb) return;
        for(const f of cb) f(...args);
    }
    _onMouseWheel(event) {
        event.preventDefault();
        this._doCallback('onMouseWheel', event);
        const vc = this.viewer.viewController;
        //let deltaSpeed = -event.deltaY / 500.0;
        //vc.adjust({moveSpeed: deltaSpeed});
        if(event.shiftKey) { //up/down
            vc.adjust({ pos:{
                x:0,
                y:event.deltaY * this._options.scrollScale,
                z:0,
            }});
        }
        else { //forward/back
            vc.moveByVector({
                x:0,
                y:-event.deltaY * this._options.scrollScale});
        }
    }
    async _onMouseDown(event) {
        this._doCallback('onMouseDown', event);
        if(event.buttons == 1) {
            if(!this.viewer) return;
            const obj = await this.viewer._getObjAt(event.clientX, event.clientY);
            this.viewer.infoWidget.show(obj);
        }
    }
    _onMouseUp(event) {
        this._doCallback('onMouseUp', event);
    }
    async _onMouseMove(event) {
        this._doCallback('onMouseMove', event);

        if(!this.viewer || !this.viewer.viewController) return;
        const view = this.viewer.viewController;

        //buttons are bitflag: 1=left 2=right 4=mid 8=back 16=fwd
        //view.set() will redraw the scene.
        if (event.buttons == 2) { //rotate
            if (this._mouseStartView) {
                view.set({
                    rot: {
                        x: this._mouseStartView.rot.x + (event.y - this._mouseStartPos[1]),
                        y: this._mouseStartView.rot.y + (event.x - this._mouseStartPos[0]),
                    },
                });
            }
            else {
                this._mouseStartView = view.get();
                this._mouseStartPos = [event.x, event.y];
            }
        }
        else if (event.buttons == 4) { //move
            if (this._mouseStartView) {
                this._doMouseCamMove(event, view);
            }
            else {
                this._mouseStartView = view.get();
                this._mouseStartPos = [event.x, event.y];
            }
        }
        else { //other buttons, including none
            this._mouseStartView = null;
        }
        this._prevMousePos = [event.x, event.y];
    }

    _doMouseCamMove(event, viewController) {
        const scale = 1;
        const dx = (event.x - this._mouseStartPos[0]) * scale;
        const dz = (event.y - this._mouseStartPos[1]) * scale;

        const view = viewController.get();
        const ry = ((view.rot.y % 360) - 180) * PI_OVER_180;
        //const rz = view.rot.z * PI_OVER_180;
        const sinRX = Math.sin(ry);
        const cosRX = Math.cos(ry);
        const x = this._mouseStartView.pos.x + ((dx * cosRX) - (dz * sinRX));
        const z = this._mouseStartView.pos.z + ((dx * sinRX) + (dz * cosRX));

        viewController.set({ pos: { x: x, z: z } });
    }

    _onKey(event, isDown) {
        const locations = {
            [KeyboardEvent.DOM_KEY_LOCATION_STANDARD]: '',
            [KeyboardEvent.DOM_KEY_LOCATION_LEFT]: 'L_',
            [KeyboardEvent.DOM_KEY_LOCATION_RIGHT]: 'R_',
            [KeyboardEvent.DOM_KEY_LOCATION_NUMPAD]: 'KP_',
        };
        const code = [
            locations[event.location],
            event.key,
            event.shiftKey ? '_Shift' : '',
            event.ctrlKey ? '_Ctrl' : '',
            event.altKey ? '_Alt' : '',
            event.metaKey ? '_Meta' : '',
            isDown ? '_Press' : '_Release'].join('');
        console.log("KEY EVENT", code, event);

        this._keysDown[event.key] = isDown;
        //'code' duplicated here is correct; we want to pass it
        //to the handler and it's also the event name
        this._doCallback(code, code, event);
    }

    _tick() {
        if(!this.viewer || !this.viewer.viewController) return;

        const view = this.viewer.viewController;
        const deltaTime = this._deltaTick / 1000.0
        const baseSpeed = 350.0;
        const speed = baseSpeed * this.viewer.context.moveSpeed;

        if(this._keysDown[' ']) {
            view.adjust({pos: {y: speed * deltaTime } });
        }
        else if(this._keysDown['c']) {
            view.adjust({pos: {y: -speed * deltaTime } });
        }

        const movement = { x: 0.0, y: 0.0 };
        if(this._keysDown["ArrowLeft"] || this._keysDown["a"]) {
            movement.x = speed * deltaTime;
        }
        if(this._keysDown["ArrowRight"] || this._keysDown["d"]) {
            movement.x = -speed * deltaTime;
        }
        if(this._keysDown["ArrowUp"] || this._keysDown["w"]) {
            movement.y = speed * deltaTime;
        }
        if(this._keysDown["ArrowDown"] || this._keysDown["s"]) {
            movement.y = -speed * deltaTime;
        }

        if(movement.x != 0.0 || movement.y != 0.0) {
            view.moveByVector(movement);
            this.viewer.clearTarget();
        }
    }
}
