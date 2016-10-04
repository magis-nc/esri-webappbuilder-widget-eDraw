///////////////////////////////////////////////////////////////////////////
// Copyright © 2014 Esri. All Rights Reserved.
//
// Licensed under the Apache License Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
///////////////////////////////////////////////////////////////////////////
define([
		'dojo/_base/declare',
		'dijit/_WidgetsInTemplateMixin',
		'jimu/BaseWidget',
		'esri/config',
		'dojo/Deferred',
		'jimu/exportUtils',
		'esri/graphic',
		'esri/symbols/SimpleMarkerSymbol',
		'esri/geometry/Polyline',
		'esri/symbols/SimpleLineSymbol',
		'esri/geometry/Polygon',
		'esri/graphicsUtils',
		'esri/symbols/SimpleFillSymbol',
		'esri/symbols/TextSymbol',
		'esri/symbols/Font',
		'esri/units',
		"esri/toolbars/edit",
		'esri/geometry/webMercatorUtils',
		'esri/tasks/GeometryService',
		'esri/tasks/AreasAndLengthsParameters',
		'esri/tasks/LengthsParameters',
		'esri/tasks/ProjectParameters',
		'jimu/SpatialReference/wkidUtils',
		'jimu/SpatialReference/utils',
		'esri/geometry/geodesicUtils',
		'esri/geometry/geometryEngine',
		'dojo/_base/lang',
		'dojo/on',
		'dojo/_base/html',
		'dojo/sniff',
		'dojo/_base/Color',
		'dojo/_base/array',
		'dojo/dom-construct',
		'dojo/dom',
		'dijit/form/Select',
		'dijit/form/NumberSpinner',
		'jimu/dijit/ViewStack',
		'jimu/dijit/SymbolChooser',
		'jimu/dijit/DrawBox',
		'jimu/dijit/Message',
		'jimu/utils',
		'jimu/symbolUtils',
		'libs/storejs/store',
		'esri/InfoTemplate',
		'esri/layers/GraphicsLayer',
		'./proj4'
	],
	function (declare, _WidgetsInTemplateMixin, BaseWidget, esriConfig, Deferred, exportUtils, Graphic, SimpleMarkerSymbol, Polyline, SimpleLineSymbol, Polygon, graphicsUtils, SimpleFillSymbol,
		TextSymbol, Font, esriUnits, Edit, webMercatorUtils, GeometryService, AreasAndLengthsParameters, LengthsParameters, ProjectParameters, wkidUtils, SRUtils, geodesicUtils, geometryEngine, lang, on,
		html, has, Color, array, domConstruct, dom, Select, NumberSpinner, ViewStack, SymbolChooser, DrawBox, Message, jimuUtils, jimuSymbolUtils, localStore, InfoTemplate, GraphicsLayer, proj4js) {

	/*jshint unused: false*/
	return declare([BaseWidget, _WidgetsInTemplateMixin], {
		name : 'eDraw',
		baseClass : 'jimu-widget-edraw',

		_gs : null,
		_defaultGsUrl : '//tasks.arcgisonline.com/ArcGIS/rest/services/Geometry/GeometryServer',

		//////////////////////////////////////////// GENERAL METHODS //////////////////////////////////////////////////
		/**
		 * Set widget mode :add1 (type choice), add2 (symbology and attributes choice), edit, list
		 * @param name string Mode
		 *     - add1 : Add drawing (type choice and measure option)
		 *     - add2 : Add drawing (attributes and symbol chooser)
		 *     - edit : Edit drawing (geometry, attributes and symbol chooser)
		 *     - list : List drawings
		 */
		setMode : function (name) {
			this.editorEnableMapPreview(false);
			this.editorActivateGeometryEdit(false);
			this.allowPopup(false);

			switch (name) {
			case 'add1':
				this.setMenuState('add');

				this._editorConfig["graphicCurrent"] = false;

				this.TabViewStack.switchView(this.addSection);

				this.drawBox.deactivate();

				this.setInfoWindow(false);
				this.allowPopup(false);

				break;
			case 'add2':
				this.setMenuState('add', ['add']);

				this._editorConfig["graphicCurrent"] = false;

				this.editorPrepareForAdd(this._editorConfig["defaultSymbols"][this._editorConfig['commontype']]);

				this.TabViewStack.switchView(this.editorSection);

				this.setInfoWindow(false);
				this.allowPopup(false);

				break;
			case 'edit':
				this.setMenuState('edit', ['edit']);
				if (this._editorConfig["graphicCurrent"]) {
					//prepare editor
					this.editorPrepareForEdit(this._editorConfig["graphicCurrent"]);

					//Focus
					var extent = graphicsUtils.graphicsExtent([this._editorConfig["graphicCurrent"]]);
					this.map.setExtent(extent.expand(2), true);
				}

				this.TabViewStack.switchView(this.editorSection);

				this.setInfoWindow(false);

				break;
			case 'list':
				this.setMenuState('list');
				this.allowPopup(true);

				//Generate list and
				this.listGenerateDrawTable();
				var nb_draws = this.drawBox.drawLayer.graphics.length;
				var display = (nb_draws > 0) ? 'block' : 'none';
				html.setStyle(this.allActionsNode, 'display', display);
				this.tableTH.innerHTML = nb_draws + ' ' + this.nls.draws;

				//Other params
				this._editorConfig["graphicCurrent"] = false;

				this.TabViewStack.switchView(this.listSection);

				break;
			}
		},

		showMessage : function (msg, type) {

			var class_icon = "message-info-icon";
			switch (type) {
			case "error":
				class_icon = "message-error-icon";
				break;
			case "warning":
				class_icon = "message-warning-icon";
				break;
			}

			var content = '<i class="' + class_icon + '">&nbsp;</i>' + msg;

			new Message({
				message : content
			});
		},

		setMenuState : function (active, elements_shown) {
			if (!elements_shown) {
				elements_shown = ['add', 'list'];
			} else if (elements_shown.indexOf(active) < 0)
				elements_shown.push(active);

			for (var button_name in this._menuButtons) {
				var menu_class = (button_name == active) ? 'menu-item-active' : 'menu-item';
				if (elements_shown.indexOf(button_name) < 0)
					menu_class = "hidden";
				if (this._menuButtons[button_name])
					this._menuButtons[button_name].className = menu_class;
			}
		},

		setInfoWindow : function (graphic) {
			if (!this.map.infoWindow)
				return false;

			if (!graphic) {
				this.map.infoWindow.hide();
				return true;
			}

			if (graphic.geometry.x)
				var center = graphic.geometry;
			else if (graphic.geometry.getCenter)
				var center = graphic.geometry.getCenter();
			else if (graphic.geometry.getExtent)
				var center = graphic.geometry.getExtent().getCenter();
			else
				return false;

			this.map.infoWindow.setFeatures([graphic]);
			this.map.infoWindow.show(center);

		},

		_clickHandler : false,
		allowPopup : function (bool) {
			this.map.setInfoWindowOnClick(bool);

			if (!bool && this._clickHandler) {
				dojo.disconnect(this._clickHandler);
			} else {
				this._clickHandler = this.drawBox.drawLayer.on("click", this._onDrawClick);
			}
		},

		saveInLocalStorage : function () {
			if (!this.config.allowLocalStorage)
				return;
			localStore.set(this._localStorageKey, this.drawingsGetJson());
		},

		getCheckedGraphics : function (returnAllIfNoneChecked) {
			var graphics = [];
			for (var i = 0, nb = this.drawBox.drawLayer.graphics.length; i < nb; i++)
				if (this.drawBox.drawLayer.graphics[i].checked)
					graphics.push(this.drawBox.drawLayer.graphics[i]);

			if (returnAllIfNoneChecked && graphics.length == 0)
				return this.drawBox.drawLayer.graphics;
			return graphics;
		},

		zoomAll : function () {
			var graphics = this.getCheckedGraphics(true);
			var nb_graphics = graphics.length;

			if (nb_graphics < 1)
				return;

			var ext = graphicsUtils.graphicsExtent(graphics);

			this.map.setExtent(ext, true);
			return true;
		},
		
		copy:function(){
			var graphics = this.getCheckedGraphics(false);
			var nb = graphics.length;

			if (nb == 0) {
				this.showMessage(this.nls.noSelection, 'error');
				return false;
			}
			
			for(var i=0;i<nb;i++){				
				var g = new Graphic(graphics[i].toJson()); //Get graphic clone
				g.attributes.name += this.nls.copySuffix; //Suffix name
				this.drawBox.drawLayer.add(g);
				if(graphics[i].measure && graphics[i].measure.graphic){
				    if (g.geometry.type=='polygon')
				        this._addPolygonMeasure(g.geometry, g);
				    else if (g.geometry.type=='polyline')
				        this._addLineMeasure(g.geometry, g);
				    else
				        this._addPointMeasure(g.geometry, g);
				}
			}
			this.setMode("list");
		},
		
		clear : function () {
			var graphics = this.getCheckedGraphics(false);
			var nb = graphics.length;

			if (nb == 0) {
				this.showMessage(this.nls.noSelection, 'error');
				return false;
			}
			
			if(this.config.confirmOnDelete){		
				this._confirmDeleteMessage  = new Message({
					message : '<i class="message-warning-icon"></i>&nbsp;' + this.nls.confirmDrawCheckedDelete,
					buttons:[
						{
							label:this.nls.yes,
							onClick:this._removeGraphics
						},{
							label:this.nls.no
						}
					]
				});
			}
			else{
				this._removeGraphics(graphics);
			}
		},
		
		_removeClickedGraphic:function(){
			if(!this._clickedGraphic)
				return false;
			
			this._removeGraphic(this._clickedGraphic);
			this._editorConfig["graphicCurrent"] = false;
			this.listGenerateDrawTable();			
			
			this._clickedGraphic = false;
			
			if(this._confirmDeleteMessage && this._confirmDeleteMessage.close){
				this._confirmDeleteMessage.close();
				this._confirmDeleteMessage = false;
			}
		},
		
		_removeGraphics:function(graphicsOrEvent){
			if(graphicsOrEvent.target)
				graphics = this.getCheckedGraphics(false);
			else
				graphics = graphicsOrEvent;

			var nb = graphics.length;
			for (var i = 0; i < nb; i++) {
				this._removeGraphic(graphics[i]);
			}
			
			if(this._confirmDeleteMessage && this._confirmDeleteMessage.close){
				this._confirmDeleteMessage.close();
				this._confirmDeleteMessage = false;
			}
			
			this.setInfoWindow(false);
			this.setMode("list");
		},

		_removeGraphic : function (graphic) {
			if (graphic.measure && graphic.measure.graphic) {
				// graphic.measure.graphic.measureParent = false; //Remove link between graphic and it's measure label
				this.drawBox.drawLayer.remove(graphic.measure.graphic); //Delete measure label
			} else if (graphic.measureParent) {
				graphic.measureParent.measure = false;
			}
			this.drawBox.drawLayer.remove(graphic);
		},

		drawingsGetJson : function (asString, onlyChecked) {
			var graphics = (onlyChecked) ? this.getCheckedGraphics(false) : this.drawBox.drawLayer.graphics;
			
			var nb_graphics = graphics.length;
			
			if (nb_graphics < 1)
				return (asString) ? '' : false;

			var content = {
				"features" : [],
				"displayFieldName" : "",
				"fieldAliases" : {},
				"spatialReference" : this.map.spatialReference.toJson(),
				"fields" : []
			};

			var features_with_measure = [];
			var nb_graphics_ok = 0;
			for (var i = 0; i < nb_graphics; i++) {
				var g = graphics[i];
				if(g){
					var json = g.toJson();
					//If with measure
					if (g.measure && g.measure.graphic) {
						features_with_measure.push(nb_graphics_ok);
					}
					content["features"].push(json);
					nb_graphics_ok++;
				}
			}

			//Replace references for measure's graphic by index
			for (var k = 0, nb = features_with_measure.length; k < nb; k++) {
				var i = features_with_measure[k];
				for (var l = 0, nb_g = graphics.length; l < nb_g; l++) {
					if (graphics[l] == graphics[i].measure.graphic) {
						content["features"][i]["measure"] = {
							"areaUnit" : graphics[i].measure.areaUnit,
							"lengthUnit" : graphics[i].measure.lengthUnit,
							"graphic" : l
						};
						break;
					}
				}
			}

			if (asString) {
				content = JSON.stringify(content);
			}
			return content;
		},

		///////////////////////// MENU METHODS ///////////////////////////////////////////////////////////
		menuOnClickAdd : function () {
			this.setMode("add1");
		},
		menuOnClickList : function () {
			this.setMode("list");
		},

		onHideCheckboxClick : function () {
			var display = (this.hideCheckbox.checked) ? 'none' : 'block';

			this.drawBox.drawLayer.setVisibility(!this.hideCheckbox.checked);
			this.menu.style.display = display;
			this.settingAllContent.style.display = display;

			if (this.hideCheckbox.checked)
				this.onClose();
			else
				this.onOpen();
		},

		///////////////////////// LIST METHODS ///////////////////////////////////////////////////////////
		listGenerateDrawTable : function () {
			//Generate draw features table
			var graphics = this.drawBox.drawLayer.graphics;
			var nb_graphics = graphics.length;

			//Table
			this.drawsTableBody.innerHTML = "";

			var name_max_len = (this.config.listShowUpAndDownButtons) ? 8 : 16;

			for (var i = nb_graphics - 1; i >= 0; i--) {
				var graphic = graphics[i];
				var num = i + 1;
				var symbol = graphic.symbol;

				var selected = (this._editorConfig["graphicCurrent"] && this._editorConfig["graphicCurrent"] == graphic);

				if (symbol.type == "textsymbol") {
					var json = symbol.toJson();
					var txt = (json.text.length > 4) ? json.text.substr(0, 4) + "..." : json.text
					var font = (json.font.size < 14) ? 'font-size:' + json.font.size + 'px;' : 'font-size:14px; font-weight:bold;';
					var color = (json.color.length == 4) ? 'rgba(' + json.color.join(",") + ')' : 'rgba(' + json.color.join(",") + ')';
					var symbolHtml = '<span style="color:' + color + ';' + font + '">' + txt + '</span>';
				} else {
					var symbolNode = jimuSymbolUtils.createSymbolNode(symbol, {
							width : 50,
							height : 50
						});
					var symbolHtml = symbolNode.innerHTML;
				}
				var name = (graphic.attributes && graphic.attributes['name']) ? graphic.attributes['name'] : '';
				name = (name.length > name_max_len) ? '<span title="' + name.replace('"', '&#34;') + '">' + name.substr(0, name_max_len) + "...</span>" : name;

				var actions = '<span class="edit blue-button" id="draw-action-edit--' + i + '" title="' + this.nls.editLabel + '">&nbsp;</span>'
					 + '<span class="clear red-button" id="draw-action-delete--' + i + '" title="' + this.nls.deleteLabel + '">&nbsp;</span>';
				var actions_class = "list-draw-actions light";
				if (this.config.listShowUpAndDownButtons) {
					actions += '<span class="up grey-button" id="draw-action-up--' + i + '" title="' + this.nls.upLabel + '">&nbsp;</span>'
					 + '<span class="down grey-button" id="draw-action-down--' + i + '" title="' + this.nls.downLabel + '">&nbsp;</span>';
					actions_class = "list-draw-actions";
				}
				actions += '<span class="zoom grey-button" id="draw-action-zoom--' + i + '" title="' + this.nls.zoomLabel + '">&nbsp;</span>';

				var checked = (graphic.checked) ? ' checked="checked"' : '';

				var html = '<td><input type="checkbox" class="td-checkbox" id="draw-action-checkclick--' + i + '" ' + checked + '/></td>'
					 + '<td>' + name + '</td>'
					 + '<td class="td-center" id="draw-symbol--' + i + '">' + symbolHtml + '</td>'
					 + '<td class="' + actions_class + '">' + actions + '</td>';
				var tr = domConstruct.create(
						"tr", {
						id : 'draw-tr--' + i,
						innerHTML : html,
						className : (selected) ? 'selected' : '',
						draggable : "true"
					},
						this.drawsTableBody);

				//Bind actions
				on(dom.byId('draw-action-edit--' + i), "click", this.listOnActionClick);
				on(dom.byId('draw-action-delete--' + i), "click", this.listOnActionClick);
				on(dom.byId('draw-action-zoom--' + i), "click", this.listOnActionClick);
				if (this.config.listShowUpAndDownButtons) {
					on(dom.byId('draw-action-up--' + i), "click", this.listOnActionClick);
					on(dom.byId('draw-action-down--' + i), "click", this.listOnActionClick);
				}
				on(dom.byId('draw-action-checkclick--' + i), "click", this.listOnActionClick);
				on(tr, "dragstart", this._listOnDragStart);
			}
			this.saveInLocalStorage();
			this.listUpdateAllCheckbox();
		},

		_listOnDrop : function (evt) {
			evt.preventDefault();
			var tr_id = evt.dataTransfer.getData("edraw-list-tr-id");

			var target = (evt.target) ? evt.target : evt.originalTarget;
			var target_tr = this._UTIL__getParentByTag(target, "tr");

			//If dropped on same tr, exit !
			if (!target_tr || target_tr.id == tr_id) {
				return false;
			}

			//get positions from id
			var from_i = tr_id.split("--")[tr_id.split("--").length - 1];
			var to_i = target_tr.id.split("--")[target_tr.id.split("--").length - 1];

			//Switch the 2 rows
			this.moveDrawingGraphic(from_i, to_i);
			this.listGenerateDrawTable();
		},

		_listOnDragOver : function (evt) {
			evt.preventDefault();
		},

		_listOnDragStart : function (evt) {
			evt.dataTransfer.setData("edraw-list-tr-id", evt.target.id);
		},

		switch2DrawingGraphics : function (i1, i2) {
			var g1 = this.drawBox.drawLayer.graphics[i1];
			var g2 = this.drawBox.drawLayer.graphics[i2];

			if (!g1 || !g2)
				return false;

			//Switch graphics
			this.drawBox.drawLayer.graphics[i1] = g2;
			this.drawBox.drawLayer.graphics[i2] = g1;

			//Redraw in good order
			var start_i = (i1 < i2) ? i1 : i2;
			this._redrawGraphics(start_i);
			return true;
		},

		moveDrawingGraphic : function (from_i, to_i) {
			from_i = parseInt(from_i);
			to_i = parseInt(to_i);

			if (from_i == to_i)
				return;

			//get from graphic
			var from_graphic = this.drawBox.drawLayer.graphics[from_i];

			//Move graphics up or down
			if (from_i < to_i) {
				for (var i = from_i, nb = this.drawBox.drawLayer.graphics.length; i < to_i && i < nb; i++)
					this.drawBox.drawLayer.graphics[i] = this.drawBox.drawLayer.graphics[i + 1];
			} else {
				for (var i = from_i, nb = this.drawBox.drawLayer.graphics.length; i > to_i && i > 0; i--)
					this.drawBox.drawLayer.graphics[i] = this.drawBox.drawLayer.graphics[i - 1];
			}

			//Copy from graphic in destination
			this.drawBox.drawLayer.graphics[to_i] = from_graphic;

			//Redraw in good order
			var start_i = (from_i < to_i) ? from_i : to_i;
			this._redrawGraphics(start_i);
			return true;
		},

		_redrawGraphics : function (start_i) {
			if (!start_i)
				start_i = 0;
			var nb = this.drawBox.drawLayer.graphics.length;
			for (var i = 0; i < nb; i++) {
				if (i >= start_i) {
					var g = this.drawBox.drawLayer.graphics[i];
					var shape = g.getShape();
					if (shape)
						shape.moveToFront();
				}
			}

		},

		listUpdateAllCheckbox : function (evt) {
			//Not called by event !
			if (evt === undefined) {
				var all_checked = true;
				var all_unchecked = true;

				for (var i = 0, nb = this.drawBox.drawLayer.graphics.length; i < nb; i++) {
					if (this.drawBox.drawLayer.graphics[i].checked)
						all_unchecked = false;
					else
						all_checked = false;
				}

				if (all_checked) {
					this.listCheckboxAll.checked = true;
					this.listCheckboxAll.indeterminate = false;
					this.listCheckboxAll2.checked = true;
					this.listCheckboxAll2.indeterminate = false;
				} else if (all_unchecked) {
					this.listCheckboxAll.checked = false;
					this.listCheckboxAll.indeterminate = false;
					this.listCheckboxAll2.checked = false;
					this.listCheckboxAll2.indeterminate = false;
				} else {
					this.listCheckboxAll.checked = true;
					this.listCheckboxAll.indeterminate = true;
					this.listCheckboxAll2.checked = true;
					this.listCheckboxAll2.indeterminate = true;
				}
				return
			}

			//Event click on checkbox!
			var cb = evt.target;
			var check = evt.target.checked;

			for (var i = 0, nb = this.drawBox.drawLayer.graphics.length; i < nb; i++) {
				this.drawBox.drawLayer.graphics[i].checked = check;
				dom.byId('draw-action-checkclick--' + i).checked = check;
			}
			this.listCheckboxAll.checked = check;
			this.listCheckboxAll.indeterminate = false;
			this.listCheckboxAll2.checked = check;
			this.listCheckboxAll2.indeterminate = false;
		},

		listOnActionClick : function (evt) {
			if (!evt.target || !evt.target.id)
				return;

			var tab = evt.target.id.split('--');
			var type = tab[0];
			var i = parseInt(tab[1]);

			var g = this.drawBox.drawLayer.graphics[i];
			this._editorConfig["graphicCurrent"] = g;

			switch (type) {
			case 'draw-action-up':
				this.switch2DrawingGraphics(i, i + 1);
				this.listGenerateDrawTable();
				break;
			case 'draw-action-down':
				this.switch2DrawingGraphics(i, i - 1);
				this.listGenerateDrawTable();
				break;
			case 'draw-action-delete':
				this._clickedGraphic = g;
				if(this.config.confirmOnDelete){		
					this._confirmDeleteMessage  = new Message({
						message : '<i class="message-warning-icon"></i>&nbsp;' + this.nls.confirmDrawDelete,
						buttons:[
							{
								label:this.nls.yes,
								onClick:this._removeClickedGraphic
							},{
								label:this.nls.no
							}
						]
					});
				}
				else{
					this._removeClickedGraphic();
				}
				break;
			case 'draw-action-edit':
				this.setMode("edit");
				break;
			case 'draw-action-zoom':
				this.setInfoWindow(g);

				var extent = graphicsUtils.graphicsExtent([g]);
				this.map.setExtent(extent, true);
				this.listGenerateDrawTable();

				break;
			case 'draw-action-checkclick':
				g.checked = evt.target.checked;
				this.listUpdateAllCheckbox();
				break;
			}
		},

		///////////////////////// SYMBOL EDITOR METHODS ///////////////////////////////////////////////////////////
		_editorConfig : {
			drawPlus : {
				"FontFamily" : false,
				"bold" : false,
				"italic" : false,
				"underline" : false,
				"angle" : false,
				"placement" : {
					"vertical" : "middle",
					"horizontal" : "center"
				}
			},
			phantom : {
				"point" : false,
				"symbol" : false,
				"layer" : false,
				"handle" : false
			}
		},

		editorPrepareForAdd : function (symbol) {
			this._editorConfig["graphicCurrent"] = false;

			this.editorSymbolChooserConfigure(symbol);

			this.nameField.value = this.nls.nameFieldDefaultValue;
			this.descriptionField.value = '';

			this.editorTitle.innerHTML = this.nls.addDrawTitle;
			this.editorFooterEdit.style.display = 'none';
			this.editorFooterAdd.style.display = 'block';
			this.editorAddMessage.style.display = 'block';
			this.editorEditMessage.style.display = 'none';
			this.editorSnappingMessage.style.display = 'none';

			var commontype = this._editorConfig['commontype'];

			//Mouse preview
			this._editorConfig["phantom"]["symbol"] = symbol;
			this.editorEnableMapPreview((commontype == 'point' || commontype == 'text'));

			//If text prepare symbol
			if (commontype == "text")
				this.editorUpdateTextPlus();

			this.editorActivateSnapping(true);

			//Prepare measure section
			this.editorMeasureConfigure(false, commontype);
		},

		editorPrepareForEdit : function (graphic) {
			this._editorConfig["graphicCurrent"] = graphic;

			this.nameField.value = graphic.attributes["name"];
			this.descriptionField.value = graphic.attributes["description"];

			this.editorActivateGeometryEdit(graphic);

			this.editorSymbolChooserConfigure(graphic.symbol);

			this.editorTitle.innerHTML = this.nls.editDrawTitle;
			this.editorFooterEdit.style.display = 'block';
			this.editorFooterAdd.style.display = 'none';
			this.editorAddMessage.style.display = 'none';
			this.editorEditMessage.style.display = 'block';
			this.editorSnappingMessage.style.display = 'block';

			this.editorEnableMapPreview(false);
			this.editorActivateSnapping(true);

			this.editorMeasureConfigure(graphic, false);
		},

		editorSymbolChooserConfigure : function (symbol) {
			if (!symbol)
				return;

			//Set this symbol in symbol chooser
			this.editorSymbolChooser.showBySymbol(symbol);
			this.editorSymbolChooser.showByType(this.editorSymbolChooser.type);
			this._editorConfig['symboltype'] = this.editorSymbolChooser.type;

			var type = symbol.type;
			//Draw plus and specific comportment when text symbol.
			if (type == "textsymbol") {
				//Force editorSymbolChooser _init to walk around jimu.js bug (initTextSection doesn't pass symbol to _initTextSettings)
				this.editorSymbolChooser._initTextSettings(symbol);

				//show draw plus
				this.editorSymbolTextPlusNode.style.display = 'block';

				//Hide text label input (use name instead of)
				var tr = this._UTIL__getParentByTag(this.editorSymbolChooser.inputText, 'tr');
				if (tr)
					tr.style.display = 'none';

				//Draw plus configuration
				this._editorConfig["drawPlus"]["bold"] = (symbol.font.weight == esri.symbol.Font.WEIGHT_BOLD);
				this._editorConfig["drawPlus"]["italic"] = (symbol.font.style == esri.symbol.Font.STYLE_ITALIC);
				this._editorConfig["drawPlus"]["underline"] = (symbol.font.decoration == 'underline');
				this._editorConfig["drawPlus"]["placement"]["horizontal"] = (symbol.horizontalAlignment) ? symbol.horizontalAlignment : "center";
				this._editorConfig["drawPlus"]["placement"]["vertical"] = (symbol.verticalAlignment) ? symbol.verticalAlignment : "middle";
				this.editorTextPlusFontFamilyNode.set("value", symbol.font.family);
				this.editorTextPlusAngleNode.set("value", symbol.angle);
				this._UTIL__enableClass(this.editorTextPlusBoldNode, 'selected', this._editorConfig["drawPlus"]["bold"]);
				this._UTIL__enableClass(this.editorTextPlusItalicNode, 'selected', this._editorConfig["drawPlus"]["italic"]);
				this._UTIL__enableClass(this.editorTextPlusUnderlineNode, 'selected', this._editorConfig["drawPlus"]["underline"]);
				for (var i = 0, len = this._editorTextPlusPlacements.length ; i < len ; i++) {
					var title_tab = this._editorTextPlusPlacements[i].title.split(" ");
					var selected = 
						(
							title_tab[0] == this._editorConfig["drawPlus"]["placement"]["vertical"] 
							&& title_tab[1] == this._editorConfig["drawPlus"]["placement"]["horizontal"]
						);
					this._UTIL__enableClass(this._editorTextPlusPlacements[i], 'selected', selected);
				}
			} else {
				//Hide draw plus
				this.editorSymbolTextPlusNode.style.display = 'none';
			}
		},

		editorActivateSnapping : function (bool) {
			//If disable
			if (!bool) {
				this.map.disableSnapping();
				return;
			}

			//If enable
			this.map.enableSnapping({
				"layerInfos" : [{
						"layer" : this.drawBox.drawLayer
					}
				],
				"tolerance" : 20
			});
		},

		editorUpdateTextPlus : function () {
			//Only if text
			if (this.editorSymbolChooser.type != "text") {
				return;
			}

			//Get parameters
			var text = this.nameField.value;
			var family = this.editorTextPlusFontFamilyNode.value;
			var angle = this.editorTextPlusAngleNode.value;
			var weight = this._editorConfig["drawPlus"]["bold"] ? esri.symbol.Font.WEIGHT_BOLD : esri.symbol.Font.WEIGHT_NORMAL;
			var style = this._editorConfig["drawPlus"]["italic"] ? esri.symbol.Font.STYLE_ITALIC : esri.symbol.Font.STYLE_NORMAL;
			var decoration = this._editorConfig["drawPlus"]["underline"] ? 'underline' : 'none';
			var horizontal = this._editorConfig["drawPlus"]["placement"]["horizontal"];
			var vertical = this._editorConfig["drawPlus"]["placement"]["vertical"];

			//Prepare symbol
			var symbol = this.editorSymbolChooser.getSymbol();
			this.editorSymbolChooser.inputText.value = text;
			symbol.text = text;
			symbol.font.setFamily(family);
			symbol.setAngle(angle);
			symbol.setHorizontalAlignment(horizontal);
			symbol.setVerticalAlignment(vertical);
			symbol.font.setWeight(weight);
			symbol.font.setStyle(style);
			symbol.font.setDecoration(decoration);

			//Set in symbol chooser
			this.editorSymbolChooser.inputText.value = text;
			this.editorSymbolChooser.showBySymbol(symbol);

			//Update in drawBox
			this.drawBox.setTextSymbol(symbol);

			//Update preview
			this.editorSymbolChooser.textPreview.innerHTML = text;
			this.editorSymbolChooser.textPreview.style.fontFamily = family;
			this.editorSymbolChooser.textPreview.style['font-style'] = (this._editorConfig["drawPlus"]["italic"]) ? 'italic' : 'normal';
			this.editorSymbolChooser.textPreview.style['font-weight'] = (this._editorConfig["drawPlus"]["bold"]) ? 'bold' : 'normal';
			this.editorSymbolChooser.textPreview.style['text-decoration'] = (this._editorConfig["drawPlus"]["underline"]) ? 'underline' : 'none';

			//Update angle preview
			this.editorTextAnglePreviewNode.style.transform = 'rotate(' + angle + 'deg)';
			this.editorTextAnglePreviewNode.style['-ms-transform'] = 'rotate(' + angle + 'deg)';

			//Update symbol on map if on modification
			if (this._editorConfig["graphicCurrent"])
				this._editorConfig["graphicCurrent"].setSymbol(symbol);
			else {
				//Update phantom symbol
				this.editorUpdateMapPreview(symbol);
			}
		},

		editorMeasureConfigure : function (graphicIfUpdate, commonTypeIfAdd) {
			this.measureSection.style.display = 'block';

			//Manage if fields are shown or not
			if (graphicIfUpdate && graphicIfUpdate.measureParent) {
				this.fieldsDiv.style.display = 'none';
				this.isMeasureSpan.style.display = 'block';
			} else {
				this.fieldsDiv.style.display = 'block';
				this.isMeasureSpan.style.display = 'none';
			}

			//add Mode
			if (commonTypeIfAdd) {
				//No measure supported for this types
				if (commonTypeIfAdd == "text") {
					this.measureSection.style.display = 'none';
					return;
				}

				this.distanceUnitSelect.set('value', this.configDistanceUnits[0]['unit']);
				this.areaUnitSelect.set('value', this.configAreaUnits[0]['unit']);
				this.pointUnitSelect.set('value', 'map');

				this.showMeasure.checked = (this.config.measureEnabledByDefault);
				this._setMeasureVisibility();

				return;
			}

			//edit mode
			if (!graphicIfUpdate) {
				this.measureSection.style.display = 'none';
				return;
			}

			var geom_type = graphicIfUpdate.geometry.type;

			//If no measure for this type of graphic
			if (geom_type == "point" && graphicIfUpdate.symbol && graphicIfUpdate.symbol.type == 'textsymbol') {
				this.measureSection.style.display = 'none';
				return;
			}

			var checked = (graphicIfUpdate.measure);

			var lengthUnit = (graphicIfUpdate.measure && graphicIfUpdate.measure.lengthUnit) ? graphicIfUpdate.measure.lengthUnit : this.configDistanceUnits[0]['unit'];
			this.distanceUnitSelect.set('value', lengthUnit);

			if (geom_type == "polygon") {
				var areaUnit = (graphicIfUpdate.measure && graphicIfUpdate.measure.areaUnit) ? graphicIfUpdate.measure.areaUnit : this.configAreaUnits[0]['unit'];
				this.areaUnitSelect.set('value', areaUnit);
			}

			this.showMeasure.checked = checked;
			this._setMeasureVisibility();
		},

		editorSetDefaultSymbols : function () {
			var symbol = this.editorSymbolChooser.getSymbol();
			switch (symbol.type.toLowerCase()) {
			case "simplemarkersymbol":
				this.drawBox.setPointSymbol(symbol);
				break;
			case "picturemarkersymbol":
				this.drawBox.setPointSymbol(symbol);
				break;
			case "textsymbol":
				this.drawBox.setTextSymbol(symbol);
				break;
			case "simplelinesymbol":
				this.drawBox.setLineSymbol(symbol);
				break;
			case "cartographiclinesymbol":
				this.drawBox.setLineSymbol(symbol);
				break;
			case "simplefillsymbol":
				this.drawBox.setPolygonSymbol(symbol);
				break;
			case "picturefillsymbol":
				this.drawBox.setPolygonSymbol(symbol);
				break;
			}
		},

		///////////////////////// IMPORT/EXPORT METHODS ///////////////////////////////////////////////////////////
		importMessage:false,
		importInput:false,
		launchImportFile:function(){
			if (!window.FileReader) {
				this.showMessage(this.nls.importErrorMessageNavigator, 'error');
				return false;
			}

			// var dragAndDropSupport = ()

			var content = '<div class="eDraw-import-message" id="'+this.id+'___div_import_message">'
				+ '<input class="file" type="file" id="'+this.id+'___input_file_import"/>'
				+ '<div class="eDraw-import-draganddrop-message">'+this.nls.importDragAndDropMessage+'</div>'
				+ '</div>';			
			this.importMessage = new Message({
				message : content,
				titleLabel:this.nls.importTitle,
				buttons:[{
					label:this.nls.importCloseButton
				}]
			});
			this.importInput = dojo.byId(this.id+'___input_file_import');
			
			//Init file's choice up watching
			on(this.importInput, "change", this.importFile);

			//Init drag & drop
			var div_message = dojo.byId(this.id+'___div_import_message');
			on(div_message, "dragover", function(e){
				e.stopPropagation();
				e.preventDefault();
				e.dataTransfer.dropEffect = 'copy';
				console.log("over !");
			});
			on(div_message, "drop", lang.hitch(this, function(e){
				e.stopPropagation();
				e.preventDefault();
				var files = e.dataTransfer.files;
				
				if(!files[0])
					return;
				var reader = new FileReader();
				reader.onload = this.importOnFileLoad;
				var txt = reader.readAsText(files[0]);
			}));
		},
		
		importFile : function () {
			if(!this.importInput){
				this.showMessage(this.nls.importErrorWarningSelectFile, 'warning');
				if(this.importMessage)
					this.importMessage.close();
				return false;
			}
			
			var input_file = this.importInput.files[0];
			if (!input_file) {
				this.showMessage(this.nls.importErrorWarningSelectFile, 'warning');
				return false;
			}
			var reader = new FileReader();
			reader.onload = this.importOnFileLoad;
			var txt = reader.readAsText(input_file);
		},
		
		importOnFileLoad : function (evt) {
			var content = evt.target.result;
			this.importJsonContent(content);
			this.importMessage.close();
		},

		importJsonContent : function (json, nameField, descriptionField) {
			try {
				if (typeof json == 'string') {
					json = JSON.parse(json);
				}

				if (!json.features) {
					this.showMessage(this.nls.importErrorFileStructure, 'error');
					return false;
				}

				if (json.features.length < 1) {
					this.showMessage(this.nls.importWarningNoDrawings, 'warning');
					return false;
				}

				if (!nameField) {
					var g = json.features[0];
					var fields_possible = ["name", "title", "label"];
					if (g.attributes) {
						for (var i in fields_possible) {
							if (g.attributes[fields_possible[i]]) {
								nameField = fields_possible[i];
								break;
							}
						}
					}
				}
				if (!descriptionField) {
					var g = json.features[0];
					var fields_possible = ["description", "descript", "desc","comment","comm"];
					if (g.attributes) {
						for (var i =0, len = fields_possible.length; i< len; i++) {
							if (g.attributes[fields_possible[i]]) {
								descriptionField = fields_possible[i];
								break;
							}
						}
					}
				}

				var measure_features_i = [];
				var graphics = [];
				for (var i = 0, len = json.features.length ; i < len ; i++) {
					var json_feat = json.features[i];

					var g = new Graphic(json_feat);

					if (!g)
						continue;

					if (!g.attributes)
						g.attributes = {};

					g.attributes["name"] = (!nameField || !g.attributes[nameField]) ? 'n°' + (i + 1) : g.attributes[nameField];
					if (g.symbol && g.symbol.type == "textsymbol")
						g.attributes["name"] = g.symbol.text;
					g.attributes["description"] = (!descriptionField || !g.attributes[descriptionField]) ? '' : g.attributes[descriptionField];

					if (!g.symbol) {
						var symbol = false;
						switch (g.geometry.type) {
						case 'point':
							var symbol = new SimpleMarkerSymbol();
							break;
						case 'polyline':
							var symbol = new SimpleLineSymbol();
							break;
						case 'polygon':
							var symbol = new SimpleFillSymbol();
							break;
						}
						if (symbol) {
							g.setSymbol(symbol);
						}
					}

					//If is with measure
					if (json_feat.measure) {
						g.measure = json_feat.measure;
						measure_features_i.push(i);
					}
					graphics.push(g);
				}

				//Treat measures
				for (var k = 0, k_len = measure_features_i.length ; k < k_len ; k++) {
					var i = measure_features_i[k]; //Indice to treat
					var label_graphic = (graphics[i].measure && graphics[i].measure.graphic && graphics[graphics[i].measure.graphic])
					 ? graphics[graphics[i].measure.graphic] :
					false;
					if (label_graphic) {
						graphics[i].measure.graphic = label_graphic
							label_graphic.measureParent = graphics[i];
					} else {
						graphics[i].measure = false;
					}
				}

				//Add graphics
				for (var i=0, nb = graphics.length; i < nb; i++){
					if(graphics[i])
						this.drawBox.drawLayer.add(graphics[i]);
				}

				//Show list
				this.setMode("list");
			} catch (e) {
				this.showMessage(this.nls.importErrorFileStructure, 'error');
				return false;
			}
		},

		exportInFile : function () {
			this.launchExport(false);
		},

		exportSelectionInFile : function (evt) {
		    if(evt && evt.preventDefault)
		        evt.preventDefault();
			this.launchExport(true);
		},

		launchExport : function (only_graphics_checked) {
			var drawing_json = this.drawingsGetJson(false, only_graphics_checked);

			// Control if there are drawings
			if (!drawing_json) {
				this.showMessage(this.nls.importWarningNoExport0Draw, 'warning');
				return false;
			}

            //We could use FeatureSet (which is required) but this workaround keeps symbols !
            var drawing_seems_featureset = {
                toJson:function(){
                    return drawing_json;
                }
            };

            //Create datasource and download !
            var ds = exportUtils.createDataSource({
                "type" : exportUtils.TYPE_FEATURESET,
                "data": drawing_seems_featureset,
                "filename" : (this.config.exportFileName) ? (this.config.exportFileName) : 'myDrawings'
            });
            ds.setFormat(exportUtils.FORMAT_FEATURESET)
            ds.download();

            return false;
		},

		///////////////////////// EDIT METHODS ///////////////////////////////////////////////////////////
		editorOnClickEditSaveButon : function () {
			if (this.editorSymbolChooser.type == "text") {
				this.editorUpdateTextPlus();
			}

			this._editorConfig["graphicCurrent"].attributes["name"] = this.nameField.value;
			this._editorConfig["graphicCurrent"].attributes["description"] = this.descriptionField.value;


            if (this.editorSymbolChooser.type != "text") {
                var geom = this._editorConfig["graphicCurrent"].geometry;
                if(geom.type=='point')
                    this._addPointMeasure(geom, this._editorConfig["graphicCurrent"]);
                else if(geom.type=='polyline')
                    this._addLineMeasure(geom, this._editorConfig["graphicCurrent"]);
                else if(geom.type=='polygon')
                    this._addPolygonMeasure(geom, this._editorConfig["graphicCurrent"]);
            }

			this.setMode("list");
		},
		editorOnClickEditCancelButon : function () {
			this.editorResetGraphic();
			this.editorActivateGeometryEdit(false);
			this.setMode("list");
		},
		editorOnClickResetCancelButon : function () {
			this.editorResetGraphic();
			this.setMode("edit");
		},

		editorResetGraphic : function () {
			if (this._editorConfig["graphicSaved"] && this._editorConfig["graphicCurrent"]) {
				var g = new Graphic(this._editorConfig["graphicSaved"]);
				this._editorConfig["graphicCurrent"].setGeometry(g.geometry);
				this._editorConfig["graphicCurrent"].setSymbol(g.symbol);
			}
		},

		editorActivateGeometryEdit : function (graphic) {
			if (!graphic)
				this.editorActivateSnapping(false);

			if (!graphic && this._editorConfig["editToolbar"]) {
				this._editorConfig["editToolbar"].deactivate();
				return;
			}

			this._editorConfig["graphicSaved"] = graphic.toJson();

			var tool = 0 | Edit.MOVE;
			if (graphic.geometry.type != "point")
				tool = tool | Edit.EDIT_VERTICES | Edit.SCALE | Edit.ROTATE;

			var options = {
				allowAddVertices : true,
				allowDeleteVertices : true,
				uniformScaling : true
			};
			this._editorConfig["editToolbar"].activate(tool, graphic, options);
		},

		///////////////////////// ADD METHODS ///////////////////////////////////////////////////////////
		drawBoxOnTypeSelected : function (target, geotype, commontype) {
			if (!this._editorConfig["defaultSymbols"])
				this._editorConfig["defaultSymbols"] = {};
			this._editorConfig['commontype'] = commontype;

			var symbol = this._editorConfig["defaultSymbols"][commontype];
			if (!symbol) {
				switch (commontype) {
				case "point":
					var options =
                        (this.config.defaultSymbols && this.config.defaultSymbols.SimpleMarkerSymbol)
                        ? this.config.defaultSymbols.SimpleMarkerSymbol
                        : null;
					symbol = new SimpleMarkerSymbol(options);
					break;
				case "polyline":
					var options =
                        (this.config.defaultSymbols && this.config.defaultSymbols.SimpleLineSymbol)
                        ? this.config.defaultSymbols.SimpleLineSymbol
                        : null;
					symbol = new SimpleLineSymbol(options);
					break;
				case "polygon":
					var options =
                        (this.config.defaultSymbols && this.config.defaultSymbols.SimpleFillSymbol)
                        ? this.config.defaultSymbols.SimpleFillSymbol
                        : null;
					symbol = new SimpleFillSymbol(options);
					break;
				case "text":
					var options =
                        (this.config.defaultSymbols && this.config.defaultSymbols.TextSymbol)
                        ? this.config.defaultSymbols.TextSymbol
                        : {"verticalAlignment": "middle", "horizontalAlignment": "center"};
					symbol = new TextSymbol(options);
					break;
				}
			}

			if (symbol) {
				this._editorConfig["defaultSymbols"][commontype] = symbol;
				this.setMode('add2');
			}
		},

		drawBoxOnDrawEnd : function (graphic, geotype, commontype) {
			var geometry = graphic.geometry;

			this.editorEnableMapPreview(false);

			graphic.attributes = {
				"name" : this.nameField.value,
				"description" : this.descriptionField.value
			}

			if (geometry.type === 'extent') {
				var a = geometry;
				var polygon = new Polygon(a.spatialReference);
				var r = [
					[a.xmin, a.ymin],
					[a.xmin, a.ymax],
					[a.xmax, a.ymax],
					[a.xmax, a.ymin],
					[a.xmin, a.ymin]
				];
				polygon.addRing(r);
				geometry = polygon;

				graphic.setGeometry(polygon);

				var layer = graphic.getLayer();
				layer.remove(graphic);
				layer.add(graphic);

				commontype = 'polygon';
			}

			if (commontype != 'text' && this.showMeasure.checked) {
			    if(geometry.type=='point')
                    this._addPointMeasure(geometry, graphic);
                else if(geometry.type=='polyline')
                    this._addLineMeasure(geometry, graphic);
                else if(geometry.type=='polygon')
                    this._addPolygonMeasure(geometry, graphic);
                else
                    console.log("Erreur de type : "+geometry.type);
            }
			if (commontype == 'text' && this.editorSymbolChooser.inputText.value.trim() == "") {
				//Message
				this.showMessage(this.nls.textWarningMessage, 'warning');

				//Remove empty feature (text symbol without text)
				graphic.getLayer().remove(graphic);
			}

			this.saveInLocalStorage();
			this._editorConfig["graphicCurrent"] = graphic;
			this._editorConfig["defaultSymbols"][this._editorConfig['commontype']] = graphic.symbol;
			this.setMode("list");
		},

		editorEnableMapPreview : function (bool) {
			//if deactivate
			if (!bool) {
				//Hide layer
				if (this._editorConfig["phantom"]["layer"])
					this._editorConfig["phantom"]["layer"].setVisibility(false);

				this._editorConfig["phantom"]["symbol"] = false;

				//Remove map handlers
				if (this._editorConfig["phantom"]["handle"]) {
					dojo.disconnect(this._editorConfig["phantom"]["handle"]);
					this._editorConfig["phantom"]["handle"] = false;
				}
				return;
			}

			//Create layer if doesn't exist
			if (!this._editorConfig["phantom"]["layer"]) {
				this._editorConfig["phantom"]["layer"] = new GraphicsLayer({
						id : this.id + "__phantomLayer"
					});
				// this._editorConfig["phantom"]["point"]
				var center = this.map.extent.getCenter();
				this._editorConfig["phantom"]["point"] = new Graphic(center, this._editorConfig["phantom"]["symbol"], {});
				this._editorConfig["phantom"]["layer"].add(this._editorConfig["phantom"]["point"]);
				this._editorConfig["phantom"]["point"].hide();

				this.map.addLayer(this._editorConfig["phantom"]["layer"]);
			} else {
				this._editorConfig["phantom"]["layer"].setVisibility(true);
				this._editorConfig["phantom"]["point"].setSymbol(this._editorConfig["phantom"]["symbol"]);
			}

			//Track mouse on map
			if (!this._editorConfig["phantom"]["handle"]) {
				this._editorConfig["phantom"]["handle"] = on(this.map, 'mouse-move, mouse-out', lang.hitch(this, function (evt) {
							if (this.state === 'opened' || this.state === 'active') {
								switch (evt.type) {
								case 'mousemove':
									if (this._editorConfig["phantom"]["point"]) {
										this._editorConfig["phantom"]["point"].setGeometry(evt.mapPoint);
										this._editorConfig["phantom"]["point"].show();
									}
									break;
								case 'mouseout':
									if (this._editorConfig["phantom"]["point"]) {
										this._editorConfig["phantom"]["point"].hide();
									}
									break;
								case 'mouseover':
									if (this._editorConfig["phantom"]["point"]) {
										this._editorConfig["phantom"]["point"].setGeometry(evt.mapPoint);
										this._editorConfig["phantom"]["point"].show();
									}
									break;
								}
							}
						}));
			}

		},

		editorUpdateMapPreview : function (symbol) {
			if (this.editorSymbolChooser.type != "text" && this.editorSymbolChooser.type != "marker") {
				return;
			}

			if (this._editorConfig["phantom"]["handle"] && this._editorConfig["phantom"]["point"]) {
				this._editorConfig["phantom"]["symbol"] = symbol;
				this._editorConfig["phantom"]["point"].setSymbol(symbol);
			}

		},

		editorOnClickAddCancelButon : function () {
			this.setMode("add1");
		},

		////////////////////////////////////// Measure methods     //////////////////////////////////////////////
		_getGeometryService : function () {
			if (!this._gs || this._gs == null) {
				if (this.config.geometryService){
				    esri.config.defaults.io.corsEnabledServers.push(this.config.geometryService.split("/")[2]);
					this._gs = new GeometryService(this.config.geometryService);
				}
				else if (esriConfig.defaults.geometryService)
					this._gs = esriConfig.defaults.geometryService;
				else{
				    esri.config.defaults.io.corsEnabledServers.push(this._defaultGsUrl.split("/")[2]);
				    this._gs = new GeometryService(this._defaultGsUrl);
				}

			}

			return this._gs;
		},

		_getLengthAndArea : function (geometry, isPolygon) {
			var def = new Deferred();
			var defResult = {
				length : null,
				area : null
			};
			var wkid = geometry.spatialReference.wkid;
			var areaUnit = this.areaUnitSelect.value;
			var esriAreaUnit = esriUnits[areaUnit];
			var lengthUnit = this.distanceUnitSelect.value;
			var esriLengthUnit = esriUnits[lengthUnit];

			if (wkid === 4326) {
				defResult = this._getLengthAndArea4326(geometry, isPolygon, esriAreaUnit, esriLengthUnit);
				def.resolve(defResult);
			} else if (wkidUtils.isWebMercator(wkid)) {
				defResult = this._getLengthAndArea3857(geometry, isPolygon, esriAreaUnit, esriLengthUnit);
				def.resolve(defResult);
			} else if (this.config.useGeometryEngine) {
				defResult = this._getLengthAndAreaGeometryEngine(geometry, isPolygon, areaUnit, lengthUnit, wkid);
				def.resolve(defResult);
			} else {
				def = this._getLengthAndAreaByGS(geometry, isPolygon, esriAreaUnit, esriLengthUnit);
			}
			return def;
		},

		_getLengthAndAreaGeometryEngine : function (geometry, isPolygon, areaUnit, lengthUnit, wkid) {
			areaUnit = areaUnit.toLowerCase().replace("_", "-");
			lengthUnit = lengthUnit.toLowerCase().replace("_", "-");

			var result = {
				area : null,
				length : null
			};

			if (isPolygon) {
				result.area = (wkid == 4326 || wkid == 3857) ? geometryEngine.geodesicArea(geometry, areaUnit) : geometryEngine.planarArea(geometry, areaUnit);
				var polyline = this._getPolylineOfPolygon(geometry);
				result.length = (wkid == 4326 || wkid == 3857) ? geometryEngine.geodesicLength(polyline, lengthUnit) : geometryEngine.planarLength(polyline, lengthUnit);
			} else {
				result.length = (wkid == 4326 || wkid == 3857) ? geometryEngine.geodesicLength(geometry, lengthUnit) : geometryEngine.planarLength(geometry, lengthUnit);
			}

			return result;
		},

		_getLengthAndArea4326 : function (geometry, isPolygon, esriAreaUnit, esriLengthUnit) {
			var result = {
				area : null,
				length : null
			};

			var lengths = null;

			if (isPolygon) {
				var areas = geodesicUtils.geodesicAreas([geometry], esriAreaUnit);
				var polyline = this._getPolylineOfPolygon(geometry);
				lengths = geodesicUtils.geodesicLengths([polyline], esriLengthUnit);
				result.area = areas[0];
				result.length = lengths[0];
			} else {
				lengths = geodesicUtils.geodesicLengths([geometry], esriLengthUnit);
				result.length = lengths[0];
			}

			return result;
		},

		_getLengthAndArea3857 : function (geometry3857, isPolygon, esriAreaUnit, esriLengthUnit) {
			var geometry4326 = webMercatorUtils.webMercatorToGeographic(geometry3857);
			var result = this._getLengthAndArea4326(geometry4326,
					isPolygon,
					esriAreaUnit,
					esriLengthUnit);

			return result;
		},

		_getLengthAndAreaByGS : function (geometry, isPolygon, esriAreaUnit, esriLengthUnit) {
			this._getGeometryService();

			var def = new Deferred();
			var defResult = {
				area : null,
				length : null
			};
			var gsAreaUnit = this._getGeometryServiceUnitByEsriUnit(esriAreaUnit);
			var gsLengthUnit = this._getGeometryServiceUnitByEsriUnit(esriLengthUnit);
			if (isPolygon) {
				var areasAndLengthParams = new AreasAndLengthsParameters();
				areasAndLengthParams.lengthUnit = gsLengthUnit;
				areasAndLengthParams.areaUnit = gsAreaUnit;
				this._gs.simplify([geometry]).then(lang.hitch(this, function (simplifiedGeometries) {
						if (!this.domNode) {
							return;
						}
						areasAndLengthParams.polygons = simplifiedGeometries;
						this._gs.areasAndLengths(areasAndLengthParams).then(lang.hitch(this, function (result) {
								if (!this.domNode) {
									return;
								}
								defResult.area = result.areas[0];
								defResult.length = result.lengths[0];
								def.resolve(defResult);
							}), lang.hitch(this, function (err) {
								def.reject(err);
							}));
					}), lang.hitch(this, function (err) {
						def.reject(err);
					}));
			} else {
				var lengthParams = new LengthsParameters();
				lengthParams.polylines = [geometry];
				lengthParams.lengthUnit = gsLengthUnit;
				lengthParams.geodesic = true;
				this._gs.lengths(lengthParams).then(lang.hitch(this, function (result) {
						if (!this.domNode) {
							return;
						}
						defResult.length = result.lengths[0];
						def.resolve(defResult);
					}), lang.hitch(this, function (err) {
						console.error(err);
						def.reject(err);
					}));
			}
			return def;
		},

		_getGeometryServiceUnitByEsriUnit : function (unit) {
			var gsUnit = -1;
			switch (unit) {
			case esriUnits.KILOMETERS:
				gsUnit = GeometryService.UNIT_KILOMETER;
				break;
			case esriUnits.MILES:
				gsUnit = GeometryService.UNIT_STATUTE_MILE;
				break;
			case esriUnits.METERS:
				gsUnit = GeometryService.UNIT_METER;
				break;
			case esriUnits.FEET:
				gsUnit = GeometryService.UNIT_FOOT;
				break;
			case esriUnits.YARDS:
				gsUnit = GeometryService.UNIT_INTERNATIONAL_YARD;
				break;
			case esriUnits.SQUARE_KILOMETERS:
				gsUnit = GeometryService.UNIT_SQUARE_KILOMETERS;
				break;
			case esriUnits.SQUARE_MILES:
				gsUnit = GeometryService.UNIT_SQUARE_MILES;
				break;
			case esriUnits.NAUTICAL_MILES:
				gsUnit = GeometryService.UNIT_NAUTICAL_MILE;
				break;
			case esriUnits.ACRES:
				gsUnit = GeometryService.UNIT_ACRES;
				break;
			case esriUnits.HECTARES:
				gsUnit = GeometryService.UNIT_HECTARES;
				break;
			case esriUnits.SQUARE_METERS:
				gsUnit = GeometryService.UNIT_SQUARE_METERS;
				break;
			case esriUnits.SQUARE_FEET:
				gsUnit = GeometryService.UNIT_SQUARE_FEET;
				break;
			case esriUnits.SQUARE_YARDS:
				gsUnit = GeometryService.UNIT_SQUARE_YARDS;
				break;
			}
			return gsUnit;
		},

		_getPolylineOfPolygon : function (polygon) {
			var polyline = new Polyline(polygon.spatialReference);
			var points = polygon.rings[0];
			points = points.slice(0, points.length - 1);
			polyline.addPath(points);
			return polyline;
		},

		_resetUnitsArrays : function () {
			this.defaultDistanceUnits = [];
			this.defaultAreaUnits = [];
			this.configDistanceUnits = [];
			this.configAreaUnits = [];
			this.distanceUnits = [];
			this.areaUnits = [];
		},

		_getDefaultDistanceUnitInfo : function (unit) {
			for (var i = 0; i < this.defaultDistanceUnits.length; i++) {
				var unitInfo = this.defaultDistanceUnits[i];
				if (unitInfo.unit === unit) {
					return unitInfo;
				}
			}
			return null;
		},

		_getDefaultAreaUnitInfo : function (unit) {
			for (var i = 0; i < this.defaultAreaUnits.length; i++) {
				var unitInfo = this.defaultAreaUnits[i];
				if (unitInfo.unit === unit) {
					return unitInfo;
				}
			}
			return null;
		},

		_getDistanceUnitInfo : function (unit) {
			for (var i = 0; i < this.distanceUnits.length; i++) {
				var unitInfo = this.distanceUnits[i];
				if (unitInfo.unit === unit) {
					return unitInfo;
				}
			}
			return null;
		},

		_getAreaUnitInfo : function (unit) {
			for (var i = 0; i < this.areaUnits.length; i++) {
				var unitInfo = this.areaUnits[i];
				if (unitInfo.unit === unit) {
					return unitInfo;
				}
			}
			return null;
		},

		_setMeasureVisibility : function () {

		    var display_point = 'none';
		    var display_line = 'none';
		    var display_area = 'none';

		    if(this._editorConfig['symboltype']){
		        ////marker,line,fill,text
		        switch(this._editorConfig['symboltype']){
		            case 'text':
		                display_point = 'none';
		                display_line = 'none';
		                display_area = 'none';
		                break;
                    case 'marker':
		                display_point = 'block';
		                display_line = 'none';
		                display_area = 'none';
		                break;
		            case 'line':
		                display_point = 'none';
		                display_line = 'block';
		                display_area = 'none';
		                break;
		            case 'fill':
		                display_point = 'none';
		                display_line = 'block';
		                display_area = 'block';
		                break;
		        }
		    }

			html.setStyle(this.pointMeasure, 'display', display_point);
			html.setStyle(this.distanceMeasure, 'display', display_line);
			html.setStyle(this.areaMeasure, 'display', display_area);
		},

		_getGraphicIndex : function (g) {
			for (var i = 0, nb = this.drawBox.drawLayer.graphics.length; i < nb; i++) {
				if (this.drawBox.drawLayer.graphics[i] == g)
					return parseInt(i);
			}
			return false;
		},

		_setMeasureTextGraphic : function (graphic, result, existingMeasureGraphic) {
			var length = result.length;
			var area = result.area;
			var x = result.x;
			var y = result.y;

			var geometry = graphic.geometry;

			//If no measure
			if (!this.showMeasure.checked) {
				if (graphic.measure && graphic.measure && graphic.measure.graphic) {
					this.drawBox.drawLayer.remove(graphic.measure.graphic) //Remove measure's label
				}
				graphic.measure = false;
				return false;
			}
			
			var pointPattern = (this.config.measurePointLabel) ? this.config.measurePointLabel : "{{x}} {{y}}";
			var polygonPattern = (this.config.measurePolygonLabel) ? this.config.measurePolygonLabel : "{{area}} {{areaUnit}}    {{length}} {{lengthUnit}}";
			var polylinePattern = (this.config.measurePolylineLabel) ? this.config.measurePolylineLabel : "{{length}} {{lengthUnit}}";

            //Prepare text
			if(x && y){
			    var text = pointPattern.replace("{{x}}", x).replace("{{y}}", y);
			    var pointUnit = this.pointUnitSelect.value;
			}
			else{
                var localeLength = jimuUtils.localizeNumber(length.toFixed(1));
                var lengthUnit = this.distanceUnitSelect.value;
                var localeLengthUnit = this._getDistanceUnitInfo(lengthUnit).label;
                if (area) {
                    var areaUnit = this.areaUnitSelect.value;
                    var localeAreaUnit = this._getAreaUnitInfo(areaUnit).label;
                    var localeArea = jimuUtils.localizeNumber(area.toFixed(1));
                    var text = polygonPattern
                        .replace("{{length}}", localeLength).replace("{{lengthUnit}}", localeLengthUnit)
                        .replace("{{area}}", localeArea).replace("{{areaUnit}}", localeAreaUnit);
                }else{
                    var text = polylinePattern
                        .replace("{{length}}", localeLength).replace("{{lengthUnit}}", localeLengthUnit);
                }
			}

			//Get label point
			var point = this._getLabelPoint(geometry);

			//Prepare symbol
			if (existingMeasureGraphic) {
				var labelGraphic = existingMeasureGraphic;
				labelGraphic.symbol.setText(text);
				labelGraphic.attributes["name"] = text;
				labelGraphic.geometry.update(point.x, point.y);
				labelGraphic.draw();
			} else {
				var a = Font.STYLE_ITALIC;
				var b = Font.VARIANT_NORMAL;
				var c = Font.WEIGHT_BOLD;
				var symbolFont = new Font("16px", a, b, c, "Courier");
				var fontColor = new Color([0, 0, 0, 1]);
				var textSymbol = new TextSymbol(text, symbolFont, fontColor);

				//If point measure, put label on top
				if(x && y){
				    textSymbol.setVerticalAlignment('bottom');
				}

				var labelGraphic = new Graphic(point, textSymbol, {
						"name" : text,
						"description" : ""
					}, null);
				this.drawBox.drawLayer.add(labelGraphic);

				//Replace measure label on top of measured graphic
				var measure_index = this._getGraphicIndex(graphic);
				var label_index = this.drawBox.drawLayer.graphics.length - 1;
				if (label_index > (measure_index+1))
					this.moveDrawingGraphic(label_index, measure_index + 1);
			}

			//Reference
			labelGraphic.measureParent = graphic;
			graphic.measure = {
				"graphic" : labelGraphic,
				"pointUnit" : pointUnit,
				"lengthUnit" : lengthUnit,
				"areaUnit" : areaUnit
			};
			return labelGraphic;
		},

		_getLabelPoint : function (geometry) {
			//Point
			if (geometry.x)
				return geometry;
			
			//Polygon
			if (geometry.getCendroid)
				return geometry.getCendroid();
			
			//Polyline
			if (geometry.getExtent) {
				var extent_center = geometry.getExtent().getCenter();
				
				//If geometryEngine, replace point (extent center) on geometry
				if (this.config.useGeometryEngine) {
					var res = geometryEngine.nearestCoordinate(geometry, extent_center);
					if (res && res.coordinate)
						return res.coordinate;
				}
				
				return extent_center;
			}

			//Extent
			if (geometry.getCenter)
				return geometry.getCenter();

			return false;
		},

        _addPointMeasure : function (geometry, graphic) {
            //Simple case : just get coordinates
            if(this.pointUnitSelect.value == "map"){
                console.log(" -> unite de la carte");
                var coords = {"x":this._round(geometry.x, 2), "y":this._round(geometry.y, 2)};
            }
            else{
                var wkid = this.map.spatialReference.wkid;
                console.log(" -> sr : ", wkid);
                var coords = null;
                //The map is in WGS84
                if(wkid == 4326){
                    console.log(" -> WGS84");
                    coords = {"x":geometry.x, "y":geometry.y};
                }
                //If map in mercator, use jimu built-in utilities
                else if(wkidUtils.isWebMercator(wkid)){
                    console.log(" -> WebMercator");
                    var point_wgs84 = webMercatorUtils.webMercatorToGeographic(geometry);
                    coords = {"x":point_wgs84.x, "y":point_wgs84.y};
                }
                //else if map's spatial reference has a wkt or get wkt by wkid, use proj4js library
                else if(this.map.spatialReference.wkt || SRUtils.indexOfWkid(wkid)>-1){
                    var proj_string = (this.map.spatialReference.wkt) ?
                        this.map.spatialReference.wkt.split("'").join('"') :
                        SRUtils.getCSStr(wkid).split("'").join('"');
                    var coords_array = proj4js(proj_string).inverse([geometry.x, geometry.y]);
                    coords = {"x":coords_array[0], "y":coords_array[1]};
                }

                if(!coords){
                    this._getGeometryService();
                    var params = new ProjectParameters();
                    params.geometries = [geometry];
                    params.outSR = {wkid:4326};
                    this._gs.project(params).then(lang.hitch(function(evt){
                        var coords = this._prepareLonLat(evt.geometries[0], this.pointUnitSelect.value == "DMS");
                        var existingMeasureGraphic =
                                (graphic.measure && graphic.measure.graphic && graphic.measure.graphic.measureParent)
                                ? graphic.measure.graphic
                                : false;
                        this._setMeasureTextGraphic(graphic, coords, existingMeasureGraphic);
                    }));
                    return;
                }

                coords = this._prepareLonLat(coords, this.pointUnitSelect.value == "DMS");
            }
            if(!coords)
                return;

            var existingMeasureGraphic =
                    (graphic.measure && graphic.measure.graphic && graphic.measure.graphic.measureParent)
                    ? graphic.measure.graphic
                    : false;
            this._setMeasureTextGraphic(graphic, coords, existingMeasureGraphic);
		},

		_prepareLonLat:function(point, as_dms){
		    console.log("_prepareLonLat",point, as_dms);
		    if(!as_dms)
		        return {x:this._round(point.x, 5),y:this._round(point.y, 5)};

		    var coords = {x:point.x, y:point.y};
		    if(coords.x<0){
                coords.x = -coords.x;
                var cardinal_point = this.nls.west;
            }
            else{
                var cardinal_point = this.nls.east;
            }
            var degres = Math.floor(coords.x);
            var minutes_float = (coords.x - degres) * 60;
            var minutes = Math.floor(minutes_float);
            var seconds = (minutes_float - minutes) * 60;
            coords.x = degres+"°"+minutes+'"'+this._round(seconds, 2)+"'"+cardinal_point;

            if(coords.y<0){
                coords.y = -coords.y;
                var cardinal_point = this.nls.south;
            }
            else{
                var cardinal_point = this.nls.north;
            }
            var degres = Math.floor(coords.y);
            var minutes_float = (coords.y - degres) * 60;
            var minutes = Math.floor(minutes_float);
            var seconds = (minutes_float - minutes) * 60;
            coords.y = degres+"°"+minutes+'"'+this._round(seconds, 2)+"'"+cardinal_point;
		    return coords;
		},

        _round:function(my_number, decimals){
            if(!decimals)
                return Math.round(my_number);
            else
                return Math.round(my_number * Math.pow(10,decimals)) / Math.pow(10,decimals);
        },

		_addLineMeasure : function (geometry, graphic) {
			this._getLengthAndArea(geometry, false).then(lang.hitch(this, function (result) {
					if (!this.domNode) {
						return;
					}
					var existingMeasureGraphic = (graphic.measure && graphic.measure.graphic && graphic.measure.graphic.measureParent) ? graphic.measure.graphic : false;
					this._setMeasureTextGraphic(graphic, result, existingMeasureGraphic);
				}));
		},

		_addPolygonMeasure : function (geometry, graphic) {
			this._getLengthAndArea(geometry, true).then(lang.hitch(this, function (result) {
					if (!this.domNode) {
						return;
					}
					var existingMeasureGraphic = (graphic.measure && graphic.measure.graphic) ? graphic.measure.graphic : false;
					this._setMeasureTextGraphic(graphic, result, existingMeasureGraphic)
				}));
		},

		////////    INIT METHODS ////////////////////////////////////////////////////////////////////////////////////////////////////////
		_bindEvents : function () {
			//bind DrawBox
			this.own(on(this.drawBox, 'IconSelected', lang.hitch(this, this.drawBoxOnTypeSelected)));
			this.own(on(this.drawBox, 'DrawEnd', lang.hitch(this, this.drawBoxOnDrawEnd)));

			//Bind symbol chooser change
			this.own(on(this.editorSymbolChooser, 'change', lang.hitch(this, function () {
						this.editorSetDefaultSymbols();
						
						//If text plus
						if (this.editorSymbolChooser.type == "text") {
							this.editorUpdateTextPlus();
						} else if (this._editorConfig["graphicCurrent"]) {
							//If in modification, update graphic symbology
							this._editorConfig["graphicCurrent"].setSymbol(this.editorSymbolChooser.getSymbol());
						}

						//Phantom for marker
						if (this.editorSymbolChooser.type == "marker")
							this.editorUpdateMapPreview(this.editorSymbolChooser.getSymbol());
					})));

			//bind unit events
			this.own(on(this.showMeasure, 'click', lang.hitch(this, this._setMeasureVisibility)));

			//hitch list event
			this.listOnActionClick = lang.hitch(this, this.listOnActionClick);
			//hitch import file loading
			this.importFile = lang.hitch(this, this.importFile);
			this.importOnFileLoad = lang.hitch(this, this.importOnFileLoad);
			
			//Bind delete method
			this._removeGraphics = lang.hitch(this, this._removeGraphics);
			this._removeClickedGraphic = lang.hitch(this, this._removeClickedGraphic);

			//Bind draw plus event
			this.editorUpdateTextPlus = lang.hitch(this, this.editorUpdateTextPlus);
			this.editorTextPlusFontFamilyNode.on("change", this.editorUpdateTextPlus);
			this.editorTextPlusAngleNode.on("change", this.editorUpdateTextPlus);
			on(this.editorTextPlusBoldNode, "click", lang.hitch(this, function (evt) {
					this._editorConfig["drawPlus"]["bold"] = !this._editorConfig["drawPlus"]["bold"];
					this._UTIL__enableClass(this.editorTextPlusBoldNode, 'selected', this._editorConfig["drawPlus"]["bold"]);
					this.editorUpdateTextPlus();
				}));
			on(this.editorTextPlusItalicNode, "click", lang.hitch(this, function (evt) {
					this._editorConfig["drawPlus"]["italic"] = !this._editorConfig["drawPlus"]["italic"];
					this._UTIL__enableClass(this.editorTextPlusItalicNode, 'selected', this._editorConfig["drawPlus"]["italic"]);
					this.editorUpdateTextPlus();
				}));
			on(this.editorTextPlusUnderlineNode, "click", lang.hitch(this, function (evt) {
					this._editorConfig["drawPlus"]["underline"] = !this._editorConfig["drawPlus"]["underline"];
					this._UTIL__enableClass(this.editorTextPlusUnderlineNode, 'selected', this._editorConfig["drawPlus"]["underline"]);
					this.editorUpdateTextPlus();
				}));
			this.onEditorTextPlusPlacementClick = lang.hitch(this, function (evt) {
					if (!evt.target)
						return;

					var selected = false;
					for (var i = 0, len = this._editorTextPlusPlacements.length ; i < len ; i++) {
						var is_this = (evt.target == this._editorTextPlusPlacements[i]);

						this._UTIL__enableClass(this._editorTextPlusPlacements[i], 'selected', is_this);

						if (is_this)
							selected = this._editorTextPlusPlacements[i];
					}
					if (!selected.title)
						return;
					var tab = selected.title.split(" ");
					this._editorConfig["drawPlus"]["placement"] = {
						"vertical" : tab[0],
						"horizontal" : tab[1]
					}
					this.editorUpdateTextPlus();
				});
			this._editorTextPlusPlacements = [
				this.editorTextPlusPlacementTopLeft,
				this.editorTextPlusPlacementTopCenter,
				this.editorTextPlusPlacementTopRight,
				this.editorTextPlusPlacementMiddleLeft,
				this.editorTextPlusPlacementMiddleCenter,
				this.editorTextPlusPlacementMiddleRight,
				this.editorTextPlusPlacementBottomLeft,
				this.editorTextPlusPlacementBottomCenter,
				this.editorTextPlusPlacementBottomRight
			];
			for (var i = 0, len = this._editorTextPlusPlacements.length ; i < len ; i++)
				on(this._editorTextPlusPlacements[i], "click", this.onEditorTextPlusPlacementClick);

		},

		_menuInit : function () {
			this._menuButtons = {
				"add" : this.menuAddButton,
				"edit" : this.menuEditButton,
				"list" : this.menuListButton,
				"importExport" : this.menuListImportExport
			};

			var views = [this.addSection, this.editorSection, this.listSection];

			this.TabViewStack = new ViewStack({
					viewType : 'dom',
					views : views
				});
			html.place(this.TabViewStack.domNode, this.settingAllContent);
		},

		_initLocalStorage : function () {
			if (!this.config.allowLocalStorage)
				return;

			this._localStorageKey =
				(this.config.localStorageKey) ? 'WebAppBuilder.2D.eDraw.' + this.config.localStorageKey : 'WebAppBuilder.2D.eDraw';

			var content = localStore.get(this._localStorageKey);

			if (!content || !content.features || content.features.length < 1)
				return;

			//Closure with timeout to be sure widget is ready
			(function (widget) {
				setTimeout(
					function () {
					widget.importJsonContent(content, "name", "description");
					widget.showMessage(widget.nls.localLoading);
				}, 200);
			})(this);

		},

		_initDrawingPopupAndClick : function () {
			//Set popup template
			var infoTemplate = new esri.InfoTemplate("${name}", "${description}");
			this.drawBox.drawLayer.setInfoTemplate(infoTemplate);

			//Set draw click
			this._onDrawClick = lang.hitch(this, function (evt) {
					if (!evt.graphic)
						return;

					this._editorConfig["graphicCurrent"] = evt.graphic;
					this.setMode("list");
				});

			//Allow click
			this.allowPopup(true);

		},

		_initListDragAndDrop : function () {
			this._listOnDragOver = lang.hitch(this, this._listOnDragOver);
			this._listOnDragStart = lang.hitch(this, this._listOnDragStart);
			this._listOnDrop = lang.hitch(this, this._listOnDrop);

			//Bind actions
			on(this.drawsTableBody, "dragover", this._listOnDragOver);
			on(this.drawsTableBody, "drop", this._listOnDrop);
		},

		_initUnitSelect : function () {
			this._initDefaultUnits();
			this._initConfigUnits();
			var a = this.configDistanceUnits;
			var b = this.defaultDistanceUnits;
			this.distanceUnits = a.length > 0 ? a : b;
			var c = this.configAreaUnits;
			var d = this.defaultAreaUnits;
			this.areaUnits = c.length > 0 ? c : d;
			array.forEach(this.distanceUnits, lang.hitch(this, function (unitInfo) {
					var option = {
						value : unitInfo.unit,
						label : unitInfo.label
					};
					this.distanceUnitSelect.addOption(option);
				}));

			array.forEach(this.areaUnits, lang.hitch(this, function (unitInfo) {
					var option = {
						value : unitInfo.unit,
						label : unitInfo.label
					};
					this.areaUnitSelect.addOption(option);
				}));
		},

		_initDefaultUnits : function () {
			this.defaultDistanceUnits = [{
					unit : 'KILOMETERS',
					label : this.nls.kilometers
				}, {
					unit : 'MILES',
					label : this.nls.miles
				}, {
					unit : 'METERS',
					label : this.nls.meters
				}, {
					unit : 'NAUTICAL_MILES',
					label : this.nls.nauticals
				}, {
					unit : 'FEET',
					label : this.nls.feet
				}, {
					unit : 'YARDS',
					label : this.nls.yards
				}
			];

			this.defaultAreaUnits = [{
					unit : 'SQUARE_KILOMETERS',
					label : this.nls.squareKilometers
				}, {
					unit : 'SQUARE_MILES',
					label : this.nls.squareMiles
				}, {
					unit : 'ACRES',
					label : this.nls.acres
				}, {
					unit : 'HECTARES',
					label : this.nls.hectares
				}, {
					unit : 'SQUARE_METERS',
					label : this.nls.squareMeters
				}, {
					unit : 'SQUARE_FEET',
					label : this.nls.squareFeet
				}, {
					unit : 'SQUARE_YARDS',
					label : this.nls.squareYards
				}
			];
		},

		_initConfigUnits : function () {
			array.forEach(this.config.distanceUnits, lang.hitch(this, function (unitInfo) {
					var unit = unitInfo.unit;
					if (esriUnits[unit]) {
						var defaultUnitInfo = this._getDefaultDistanceUnitInfo(unit);
						unitInfo.label = defaultUnitInfo.label;
						this.configDistanceUnits.push(unitInfo);
					}
				}));

			array.forEach(this.config.areaUnits, lang.hitch(this, function (unitInfo) {
					var unit = unitInfo.unit;
					if (esriUnits[unit]) {
						var defaultUnitInfo = this._getDefaultAreaUnitInfo(unit);
						unitInfo.label = defaultUnitInfo.label;
						this.configAreaUnits.push(unitInfo);
					}
				}));
		},

		//////////////////////////// WIDGET CORE METHODS ///////////////////////////////////////////////////////////////////////////////////////

		postMixInProperties : function () {
			this.inherited(arguments);
			this._resetUnitsArrays();
		},

		postCreate : function () {
			this.inherited(arguments);

			//Create symbol chooser
			this.editorSymbolChooser = new SymbolChooser({
					"class" : "full-width",
					"type" : "text",
					"symbol" : new SimpleMarkerSymbol()
				},
					this.editorSymbolChooserDiv);

			this.drawBox.setMap(this.map);

			//Initialize menu
			this._menuInit();

			//Init measure units
			this._initUnitSelect();

			//Bind and hitch events
			this._bindEvents();

			//Prepare text plus
			this._prepareTextPlus();

			//load if drawings in localStorage
			this._initLocalStorage();

			//Popup or click init
			this._initDrawingPopupAndClick();

			//Create edit dijit
			this._editorConfig["editToolbar"] = new Edit(this.map);

			//Init list Drag & Drop
			this._initListDragAndDrop();

			//Load ressources
			SRUtils.loadResource();
		},

		_prepareTextPlus : function () {
			//Select central position in UI (text placement)
			this._UTIL__enableClass(this._editorTextPlusPlacements[4], 'selected', true);

			//Manage availaible FontFamily
			if (this.config.drawPlus && this.config.drawPlus.fontFamilies) {
				if (this.config.drawPlus.fontFamilies.length > 0) {
					this.editorTextPlusFontFamilyNode.set("options", this.config.drawPlus.fontFamilies).reset();
				}
			}

		},

		onOpen : function () {
			if (this.drawBox.drawLayer.graphics.length > 0)
				this.setMode("list");
			else
				this.setMode("add1");
		},

		onClose : function () {
			this.editorResetGraphic();
			this.drawBox.deactivate();
			this.setInfoWindow(false);
			this.editorEnableMapPreview(false);
			this.editorActivateGeometryEdit(false);
			this.map.infoWindow.hide();
			this.allowPopup(true);
		},

		destroy : function () {
			if (this.drawBox) {
				this.drawBox.destroy();
				this.drawBox = null;
			}
			if (this.editorSymbolChooser) {
				this.editorSymbolChooser.destroy();
				this.editorSymbolChooser = null;
			}
			this.inherited(arguments);
		},

		///////////////////////// UTILS METHODS ////////////////////////////////////////////////////////////////////////////
		_UTIL__enableClass : function (elt, className, bool) {
			if (elt.classList) {
				if (bool)
					elt.classList.add(className);
				else
					elt.classList.remove(className);
				return;
			}
			elt.className = elt.className.replace(className, "").replace("  ", " ").trim();
			if (bool)
				elt.className += className;
		},

		_UTIL__getParentByTag : function (el, tagName) {
			tagName = tagName.toLowerCase();
			while (el && el.parentNode) {
				el = el.parentNode;
				if (el.tagName && el.tagName.toLowerCase() == tagName) {
					return el;
				}
			}
			return null;
		}

	});
	////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
});
