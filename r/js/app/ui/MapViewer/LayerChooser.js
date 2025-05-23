import { clearElement, E } from "../../../lib/Element.js";

export const NUM_OBJ_GROUPS = 32; //only supposed to be 20, but lots of triggers reference 31
export const NUM_MAP_ACTS   = 16;

/** Widget that lets you choose what to display. */
export default class LayerChooser {
    constructor(mapViewer) {
        this._nextId   = 0;
        this.mapViewer = mapViewer;
        this.game      = mapViewer.game;
        this.app       = mapViewer.game.app;

        this.eGeom = E.div('geometry', "Geometry:");
        this.eLayers = E.details('map-layers', {open:'open'},
            E.summary(null, "Layers"), this.eGeom);
        this.eObjs = E.details('map-objects', {open:'open'},
            E.summary(null, "Objects"));
        this.eDebug = E.details('map-debug',
            E.summary(null, "Debug"));

        this.element = E.div('map-layer-chooser', this.eLayers,
            this.eObjs, this.eDebug);

        this.layers      = {};
        this.layers      = {};
        this._layerOrder = [];
        this._addLayer(this.eGeom, 'boolean', 'mainGeometry',
            "Main", true, "Non-translucent, non-reflective polygons");
        this._addLayer(this.eGeom, 'boolean', 'waterGeometry',
            "Water", true, "Translucent, reflective polygons");
        //XXX this should be renamed
        this._addLayer(this.eGeom, 'boolean', 'reflectiveGeometry',
            "Translucent", true, "Translucent, non-reflective polygons");
        this._addLayer(this.eGeom, 'boolean', 'hiddenGeometry',
            "Hidden", false, "Polygons normally not visible");

        this._addLayer(this.eLayers, 'boolean', 'origin', "Origin", false,
            "Map's origin point");
        this._addLayer(this.eLayers, 'boolean', 'warps', "Warps", false,
            "WARPTAB entries");
        this._addLayer(this.eLayers, 'boolean', 'blockBounds', "Block Bounds",
            false, "Map block boundary boxes");

        this._addLayer(this.eLayers, 'boolean', 'hitPolys', "Collision Mesh",
            false, "Hit detect mesh");
        this._addLayer(this.eLayers, 'boolean', 'polyGroups', "Poly Groups",
            false, "Polygon group boxes");
        this._addLayer(this.eLayers, 'boolean', 'blockHits', "Block Hits", false,
            "Data from HITS.bin");

        this._addLayer(this.eObjs, 'boolean', 'triggers', "Triggers",
            false, "Invisible control objects");
        this._addLayer(this.eObjs, 'boolean', 'curves', "Curves",
            false, "Invisible control objects");

        //populate the Objects box
        this._makeObjColorPicker();
        this._makeActPicker();
        this._makeObjGroupPicker();

        //debug
        this.eWhichList = E.input(null, {type:'number', value:-1});
        this.eWhichList.addEventListener('change', e => this.mapViewer.redraw());
        this.eDebug.append(E.div('debug',
            E.span('label', "Dlist:"), this.eWhichList,
        ));
    }

    _makeObjColorPicker() {
        this.eObjColor = E.select(null, {id:'map-view-obj-color-mode'},
            E.option(null, {value:'category'}, "Category"),
            E.option(null, {value:'dll'}, "DLL"),
            E.option(null, {value:'group'}, "Group"),
        );
        this.eObjs.append(
            E.label(null, {'for':'map-view-obj-color-mode'}, "Color:"),
            this.eObjColor
        );
        this.eObjColor.addEventListener('change', e => {
            this.mapViewer.redraw();
        });
    }
    _makeActPicker() {
        this.eActs = E.span('act-list', E.div('subtitle', "Acts"));
        for(let i=1; i<NUM_MAP_ACTS; i++) {
            this._addLayer(this.eActs, 'boolean', `act${i}`,
                i.toString().padStart(2), false);
        }
        const eBox = E.input(null, {type:'checkbox', id:'mapview-layers-allacts'});
        const eLbl = E.label(null, {'for':'mapview-layers-allacts'}, "All");
        const eDiv = E.div('checkbox', eBox, eLbl);
        eBox.addEventListener('change', e => {
            for(let i=1; i<NUM_MAP_ACTS; i++) {
                this.setLayer(`act${i}`, eBox.checked, false);
            }
            this.mapViewer.redraw();
        });
        this.eActs.append(eDiv);
        this.eAllActsLabel = eLbl;
        this.eObjs.append(this.eActs);
    }
    _makeObjGroupPicker() {
        this.eObjGroups = E.span('objgroup-list', E.div('subtitle', "Obj Groups"));
        for(let i=0; i<NUM_OBJ_GROUPS; i++) {
            this._addLayer(this.eObjGroups, 'boolean', `group${i}`,
                i.toString().padStart(2), true);
        }
        this._addLayer(this.eObjGroups, 'boolean', 'group-1',
            "Ungrouped", true);
        const eBox = E.input(null, {type:'checkbox',
            id:'mapview-layers-allgroups', checked:'checked'});
        const eLbl = E.label(null, {'for':'mapview-layers-allgroups'}, "All");
        const eDiv = E.div('checkbox', eBox, eLbl);
        eBox.addEventListener('change', e => {
            for(let i=-1; i<NUM_OBJ_GROUPS; i++) {
                this.setLayer(`group${i}`, eBox.checked, false);
            }
            this.mapViewer.redraw();
        });
        this.eObjGroups.append(eDiv);
        this.eAllGroupsLabel = eLbl;
        this.eObjs.append(this.eObjGroups);
    }

    _addLayer(parent, type, name, displayName, value=undefined, tooltip='') {
        const layer = {
            name:        name,
            displayName: displayName,
            tooltip:     tooltip,
            type:        type,
            value:       value,
        };
        this.layers[name] = layer;
        this._layerOrder.push(name);

        const id = `mapview-layers-${name}`;
        switch(type) {
            case 'boolean': {
                const eBox = E.input(null, {type:'checkbox', id:id});
                const eLbl = E.label(null, {'for':id}, displayName);
                const eDiv = E.div('checkbox', eBox, eLbl);
                if(value) eBox.checked = true;
                eBox.addEventListener('change', e => this.toggleLayer(name));
                layer.eLabel   = eLbl;
                layer.element  = eDiv;
                layer.checkbox = eBox;
                break;
            }

            case 'list': {
                const elem = E.select({id:id});
                layer.element = E.div('list',
                    E.label(null, {'for':id}, displayName),
                    elem);
                layer.list = elem;
                elem.addEventListener('change',
                    e => this.setLayer(name, elem.value));
                break;
            }
        }

        const elem = layer.element;
        if(elem) {
            if(tooltip != null) elem.setAttribute('title', tooltip);
            if(elem.id == '') elem.id = `${id}-element`;
            parent.append(elem);
        }
        else console.warn("No element created for layer", layer);
    }

    toggleLayer(name) {
        const layer = this.layers[name];
        switch(layer.type) {
            case 'boolean':
                this.setLayer(name, !layer.value);
                break;
        }
    }

    setLayer(name, value, redraw=true) {
        const layer = this.layers[name];
        layer.value = value;
        switch(layer.type) {
            case 'boolean':
                layer.checkbox.checked = value;
                break;
        }
        if(redraw) this.mapViewer.redraw();
    }

    getLayer(name) {
        return this.layers[name].value;
    }

    getActs() {
        let result = 0;
        for(let i=1; i<16; i++) {
            if(this.getLayer(`act${i}`)) result |= (1 << (i-1));
        }
        return result;
    }

    getGroups() {
        let result = 0;
        for(let i=-1; i<NUM_OBJ_GROUPS; i++) {
            if(this.layers[`group${i}`].value) result |= (1 << (i+1));
        }
        return result;
    }

    getObjColorMode() {
        return this.eObjColor.value;
    }

    _updateActList() {
        const actCounts = []; //act# => obj count
        const groupCounts = {}; //group# => obj count (starts at -1)
        for(let i= 0; i<NUM_MAP_ACTS; i++) actCounts.push(0);
        for(let i=-1; i<NUM_OBJ_GROUPS; i++) groupCounts[i] = 0;
        let objs = this.mapViewer.map.romList;
        if(objs) objs = objs.entries;
        if(!objs) objs = [];
        for(let obj of objs) {
            for(let i=1; i<NUM_MAP_ACTS; i++) {
                if(obj.acts[i]) actCounts[i]++;
            }
            for(let i = -1; i<NUM_OBJ_GROUPS; i++) {
                if(obj.group == i) groupCounts[i]++;
            }
        }
        for(let i=1; i<NUM_MAP_ACTS; i++) {
            const layer = this.layers[`act${i}`];
            layer.eLabel.innerText =
                `${i.toString().padStart(2)} (${actCounts[i].toString().padStart(4)})`;
            if(actCounts[i]) {
                layer.element.classList.remove('empty');
            }
            else layer.element.classList.add('empty');
        }
        //missing space on purpose here for alignment.
        this.eAllActsLabel.innerText = `All(${objs.length.toString().padStart(4)})`;

        for(let i=-1; i<NUM_OBJ_GROUPS; i++) {
            const layer = this.layers[`group${i}`];
            let name = (i < 0) ? "Ungrouped" : i.toString().padStart(2);
            layer.eLabel.innerText =
                `${name} (${groupCounts[i].toString().padStart(4)})`;
            if(groupCounts[i]) {
                layer.element.classList.remove('empty');
            }
            else layer.element.classList.add('empty');
        }
        this.eAllGroupsLabel.innerText = `All (${objs.length.toString().padStart(4)})`;
    }

    refresh() {
        if(!this.mapViewer.map) return;
        this._updateActList();
    }
}
