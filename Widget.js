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
    'esri/graphic',
    'esri/geometry/Point',
    'esri/symbols/SimpleMarkerSymbol',
    'esri/geometry/Polyline',
    'esri/symbols/SimpleLineSymbol',
    'esri/geometry/Polygon',
    "esri/graphicsUtils",
    'esri/symbols/SimpleFillSymbol',
    'esri/symbols/TextSymbol',
    'esri/symbols/Font',
    'esri/units',
    'esri/geometry/webMercatorUtils',
    'esri/geometry/geodesicUtils',
    'dojo/_base/lang',
    'dojo/on',
    'dojo/_base/html',
	"dojo/sniff",
    'dojo/_base/Color',
    'dojo/_base/query',
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
	'esri/layers/GraphicsLayer'
  ],
  function(declare,_WidgetsInTemplateMixin,BaseWidget,Graphic,Point,
    SimpleMarkerSymbol,Polyline,SimpleLineSymbol,Polygon,graphicsUtils,SimpleFillSymbol,
    TextSymbol,Font, esriUnits,webMercatorUtils,geodesicUtils,lang,on,html,has,
    Color,Query,array, domConstruct, dom, Select,NumberSpinner,ViewStack,SymbolChooser,
    DrawBox, Message, jimuUtils, jimuSymbolUtils, localStore, InfoTemplate,GraphicsLayer) {/*jshint unused: false*/
    return declare([BaseWidget, _WidgetsInTemplateMixin], {
      name: 'eDraw',
      baseClass: 'jimu-widget-draw',
	  
	  
	  _drawPlus:{
		"add":{
			"police":false,
			"bold":false,
			"italic":false,
			"underline":false,
			"angle":false
		},
		"edit":{
			"police":false,
			"bold":false,
			"italic":false,
			"underline":false,
			"angle":false
		}
	  },
	  
	  startup: function() {
        this.inherited(arguments);
        this.viewStack.startup();
        this.viewStack.switchView(null);
      },
	  
      postMixInProperties: function(){
        this.inherited(arguments);
        this._resetUnitsArrays();
      },

      postCreate: function() {
        this.inherited(arguments);
        jimuUtils.combineRadioCheckBoxWithLabel(this.showMeasure, this.showMeasureLabel);
        this.drawBox.setMap(this.map);

        this.viewStack = new ViewStack({
          viewType: 'dom',
          views: [this.pointSection, this.lineSection, this.polygonSection, this.textSection]
        });
        html.place(this.viewStack.domNode, this.settingContent);
		
		//Global view (add/list)
		this._initTabs();
		
		
        this._initUnitSelect();
        this._bindEvents();
		
		//load if drawings in localStorage
		this._initLocalStorage();
		
		//Popup or click init
		this._initDrawingPopupAndClick();

		
      },
	  
	  onClose:function(){
		this.selectDrawing(false);
		this._enableMapPreview(false);
	  },
	  
	  onOpen:function(){
		if(this.drawBox.drawLayer.graphics.length > 0)
			this.setTab("list");
		else
			this.setTab("add");
	  },
	 
      _initTabs:function(){
			this._tabsConfig={
				"add":{
					button:this.addSectionButton,
					view:this.addSection,
					active:"menu-item-active",
					inactive:"menu-item",
					buttons_when_active:"*"
				},
				"edit":{
					button:this.editSectionButton,
					view:this.editSection,
					onlyVisible:true,
					active:"menu-item-active ",
					inactive:"hidden",
					buttons_when_active:["list"]
				},
				"list":{
					button:this.listSectionButton,
					view:this.listSection,
					onlyVisible:true,
					active:"menu-item-active",
					inactive:"menu-item",
					buttons_when_active:"*"
				},
				"importExport":{
					button:this.importExportSectionButton,
					view:this.importExportSection,
					onlyVisible:true,
					active:"menu-item-active",
					inactive:"menu-item",
					buttons_when_active:"*"
				}
		    };
		  
		  if(!this.config.allowImportExport){
			this.importExportSectionButton.style.display = 'none';
		  }		  
		  
			var views = [];
			for(var name in this._tabsConfig)
				views.push(this._tabsConfig[name]["view"]);
			
			
			this.globalViewStack = new ViewStack({
			  viewType: 'dom',
			  views: views
			});
			html.place(this.globalViewStack.domNode, this.settingAllContent);			
	  },	 
	  
	  
	  
	  setTab:function(name){
		var tab_asked = this._tabsConfig[name];
		
		this._enableMapPreview(false);
		
		if(!tab_asked)
			return false;
		
		for(var tab in this._tabsConfig){
			if(tab==name || tab_asked["buttons_when_active"]=="*" || tab_asked["buttons_when_active"].indexOf(tab) != -1){
				this._tabsConfig[tab]["button"].className = 
					(tab==name)
					? this._tabsConfig[tab]["active"]
					: this._tabsConfig[tab]["inactive"];
			}
			else{
				this._tabsConfig[tab]["button"].className = "hidden";
			}
		}
		this.globalViewStack.switchView(this._tabsConfig[name]["view"]);
		
		switch(name){
			case "add":
				this._editGraphic = false;
				this.selectDrawing(false);				
				break;			
			case "list":
				this._generateDrawTable();
				
				var nb_draws = this.drawBox.drawLayer.graphics.length;
				var display = (nb_draws>0) ? 'block' : 'none';
				html.setStyle(this.allActionsNode,'display',display);
				this.tableTH.innerHTML = nb_draws + ' ' + this.nls.draws;
				
				//Save data in local storage
				this._saveInLocalStorage();
				
				break;
			case "edit":
				if(this._editGraphic){
					this.selectDrawing(this._editGraphic);
					this.editNameField.value = this._editGraphic.attributes["name"];
					this.editDescriptionField.value = this._editGraphic.attributes["description"];
					
					this.selectDrawing(this._editGraphic);
					
					this._initEditSymbolChooser();
				}
				
				break;
			default:
				this._editGraphic = false;
				this.selectDrawing(false);
		}
		return true;
	  },
	  
	   _generateDrawTable:function(){
		//Generate draw features table
		var graphics = this.drawBox.drawLayer.graphics;
		var nb_graphics = graphics.length;
		
		//Table
		this.drawsTableBody.innerHTML = "";
		
		for(var i = nb_graphics-1; i>=0;i--){
		  var graphic = graphics[i];
		  var num = i+1;
		  var symbol = graphic.symbol;
		  
		  var selected = (this._editGraphic && this._editGraphic==graphic);
		  
		  if(selected)
			this.selectDrawing(graphic);
		  
		  if(symbol.type=="textsymbol"){
			var json = symbol.toJson();
			var txt = (json.text.length>4) ? json.text.substr(0,4)+"..." : json.text
			var font = (json.font.size < 14) ? 'font-size:'+json.font.size+'px;' : 'font-size:14px; font-weight:bold;';
			var color = (json.color.lenght==4) ? 'rgba('+json.color.join(",")+')' : 'rgba('+json.color.join(",")+')';
			var symbolHtml = '<span style="color:'+color+';'+font+'">'+txt+'</span>';
		  }else{	
			var symbolNode = jimuSymbolUtils.createSymbolNode(symbol, {width:50, height:50});
			var symbolHtml = symbolNode.innerHTML;
		  }
		  var name = (graphic.attributes && graphic.attributes['name']) ? graphic.attributes['name'] : '';
		  var html = '<td>'+name+'</td>'
		    +  '<td class="td-center" id="draw-symbol--'+i+'">'+symbolHtml+'</td>'
			+ '<td class="list-draw-actions">'
			+		'<span class="edit blue-button" id="draw-action-edit--'+i+'" title="'+this.nls.editLabel+'">&nbsp;</span>'
			+		'<span class="clear red-button" id="draw-action-delete--'+i+'" title="'+this.nls.deleteLabel+'">&nbsp;</span>'
			+		'&nbsp;&nbsp;'
			+		'<span class="up grey-button" id="draw-action-up--'+i+'" title="'+this.nls.upLabel+'">&nbsp;</span>'
			+		'<span class="down grey-button" id="draw-action-down--'+i+'" title="'+this.nls.downLabel+'">&nbsp;</span>'
			+		'&nbsp;&nbsp;'
			+		'<span class="zoom grey-button" id="draw-action-zoom--'+i+'" title="'+this.nls.zoomLabel+'">&nbsp;</span>'
			+ '</td>';
		  
		  
		  var tr = domConstruct.create(
			"tr",
			{
				id : 'draw-tr--'+i,
				innerHTML : html,
				className:(selected) ? 'selected' : ''
			},
			this.drawsTableBody
		  );
		  
		  //Bind actions
		  on(dom.byId('draw-action-edit--'+i), "click", this.onActionClick);
		  on(dom.byId('draw-action-up--'+i), "click", this.onActionClick);
		  on(dom.byId('draw-action-down--'+i), "click", this.onActionClick);
		  on(dom.byId('draw-action-delete--'+i), "click", this.onActionClick);
		  on(dom.byId('draw-action-zoom--'+i), "click", this.onActionClick);
		}
	  },	  
	  
	  _clickAddButon:function(){
		this.setTab("add");
	  },
	  _clickListButon:function(){
		this.setTab("list");
	  },
	  _clickImportExportButon:function(){
	    this.setTab("importExport");
	  },
	  _clickEditSaveButon:function(){
			if(this._EditSymbolChooser.type=="text"){
				this._EditSymbolChooser.inputText.value = this.editNameField.value;
				this._update_edit_textSymbol();
			}
			
			this._editGraphic.attributes["name"] = this.editNameField.value;
			this._editGraphic.attributes["description"] = this.editDescriptionField.value;
			this._editGraphic.setSymbol(this._EditSymbolChooser.symbol);
			this.setTab("list");
	  },
	   _clickEditCancelButon:function(){
			this.setTab("list");
	  },
	  _clickResetCancelButon:function(){
		this.setTab("edit");
	  },
	  
	  
	  _initEditSymbolChooser:function(){
		if(!this._editGraphic)
			return false;
		
		var geom_type = this._editGraphic.geometry.type;
		var type = false;
		switch(geom_type){
			case "point":
				type = (this._editGraphic.symbol.type=="textsymbol") ? "text" : "marker";
				break;
			case "polyline":
				type = "line";
				break;
			case "fill":
				type = "marker";
				break;
		}
		
		//textPlus
		this.EditSymbolTextPlusNode.style.display = (type=="text") ? 'block' : 'none';
		
		//Show (or create) symbolChooser
		if(this._EditSymbolChooser){
			this._EditSymbolChooser.showBySymbol(this._editGraphic.symbol);
		}
		else{
			//Create symbolChooser dijit
			this._EditSymbolChooser = new SymbolChooser(
				{type:type, symbol:this._editGraphic.symbol, class:"full-width"},
				this.EditSymbolChooserDiv
			);
			if(type=="text"){
				var tr = this._parentByTag(this._EditSymbolChooser.inputText, 'tr');
				if(tr)
					tr.style.display = 'none';
			}
		}
		
		//TEXT PLUS
		if(type=="text"){
			this._drawPlus["edit"]["bold"] = (this._editGraphic.symbol.font.weight == esri.symbol.Font.WEIGHT_BOLD);
			this._drawPlus["edit"]["italic"] = (this._editGraphic.symbol.font.style == esri.symbol.Font.STYLE_ITALIC);
			this._drawPlus["edit"]["underline"] = (this._editGraphic.symbol.font.decoration == 'underline');
			// this.EditTextPlusPoliceNode.value = this._editGraphic.symbol.font.family;
			this.EditTextPlusPoliceNode.set("value",this._editGraphic.symbol.font.family);
			// this.EditTextAngleNode.value = this._editGraphic.symbol.angle;
			this.EditTextAngleNode.set("value", this._editGraphic.symbol.angle);
			
			this._enableClass(this.EditTextPlusBoldNode, 'selected',this._drawPlus["edit"]["bold"]);
			this._enableClass(this.EditTextPlusItalicNode, 'selected',this._drawPlus["edit"]["italic"]);
			this._enableClass(this.EditTextPlusUnderlineNode, 'selected',this._drawPlus["edit"]["underline"]);
		}
		
	  },
	  
	  __prevent_next_infowindow_slot:false,
	  _initDrawingPopupAndClick:function(){
		var infoTemplate = new esri.InfoTemplate("${name}","${description}");
		this.drawBox.drawLayer.setInfoTemplate(infoTemplate);
	    
		//Catch with infowindow
		if(this.map.infoWindow){
			this._onInfoWinHide=lang.hitch(this, function(){
				if(this.__prevent_next_infowindow_slot){
					this.__prevent_next_infowindow_slot = false;
					return;
				}
				
				this._editGraphic = false;
				this.selectDrawing(false);
				this.setTab("list");
			});
			this._onInfoWinShow=lang.hitch(this, function(evt){				
				if(this.__prevent_next_infowindow_slot){
					this.__prevent_next_infowindow_slot = false;
					return;
				}
				
				
				if(
					evt.target 
					&& evt.target.features 
					&& evt.target.count ==1
					&& evt.target.features[0].getLayer()
					&& evt.target.features[0].getLayer().id == this.drawBox.drawLayer.id
				){
					this._editGraphic = evt.target.features[0];
				}
				else
					this._editGraphic = false;
					
				this.setTab("list");				
			});
			this.map.infoWindow.on("hide", this._onInfoWinHide);
			this.map.infoWindow.on("show", this._onInfoWinShow);
		}
		//If no infowindow catch click on draw
		else{
			this._onDrawClick = lang.hitch(this, function(evt){
				if(!evt.graphic)
					return;
				
				this._editGraphic = evt.graphic;
				this.setTab("list");
			  });
			this.drawBox.drawLayer.on("click", this._onDrawClick);
		}
	  },
	  
	  setInfoWindow:function(graphic){
		if(!this.map.infoWindow)
			return false;
		
		//Prevent next e
		this.__prevent_next_infowindow_slot=true;
		
		if(!graphic){
			this.map.infoWindow.hide();
			return true;
		}
		
		var center = (graphic.geometry.getExtent) ? graphic.geometry.getExtent() : graphic.geometry;
		
		this.map.infoWindow.setFeatures([graphic]);
		this.map.infoWindow.show(center);
	  
	  },
	  
	  
	  _saveInLocalStorage:function(){
		if(!this.config.allowLocalStorage)
			return;
			
		localStore.set(this._localStorageKey, this.drawingsAsJson());  
	  },
	  _initLocalStorage:function(){
			if(!this.config.allowLocalStorage)
				return;
			
			this._localStorageKey = 
				(this.config.localStorageKey) 
				? 'WebAppBuilder.2D.eDraw.'+this.config.localStorageKey 
				: 'WebAppBuilder.2D.eDraw';
			
			var content = localStore.get(this._localStorageKey);
			
			if(!content || !content.features || content.features.length < 1)
				return;
			
			//Closure with timeout to be sure widget is ready
			(function(widget){
				setTimeout(
					function(){
						widget._importJsonContent(content, "name", "description");
						widget.showMessage(widget.nls.localLoading);
					}
					,200
				);
			})(this);
			
			
	  },
	  
	  
	  // __drawingClickHandler:false,
	  // _enabledDrawingClickHandle:function(bool){
		// if(bool && !this.__drawingClickHandler)
			// this.drawingClickHandler = this.drawBox.drawLayer.on("click", this._showPopup);
		// else{
			// dojo.disconnect(this.drawingClickHandler);
			// this.drawingClickHandler = false;
		// }
	  // },
	  
	   zoomAll:function(){
			var graphics = this.drawBox.drawLayer.graphics;
			var nb_graphics = graphics.length;
			
			if(nb_graphics<1)
				return;
			
			var ext = graphicsUtils.graphicsExtent(this.drawBox.drawLayer.graphics);
			
			this.map.setExtent(ext, true);
			return true;
	   },	   
	  
	  
	  clear:function(){
		if(!this.config.confirmOnDelete || confirm(this.nls.clear)){
			this.drawBox.drawLayer.clear();
			this.setTab("list");
		}
	  },
	  
	  import:function(){
		if (!window.FileReader) {
			this.showMessage(this.nls.importErrorMessageNavigator, 'error');
			return false;
		}
		
		var input = this.importFile.files[0];
		
		if(!input){
			this.showMessage(this.nls.importErrorWarningSelectFile, 'warning');
			return false;		
		}
		var reader = new FileReader();
		reader.onload= this._importOnFileLoad;
		var txt = reader.readAsText(input);
	  },
	  
	  
	  _importJsonContent:function(json, nameField, descriptionField){
		try{			
			if(typeof json == 'string'){
				json = JSON.parse(json);
			}
			
			if(!json.features){
				this.showMessage(this.nls.importErrorFileStructure, 'error');
				return false;
			}

			if(json.features.length<1){
				this.showMessage(this.nls.importWarningNoDrawings, 'warning');
				return false;
			}

			if(!nameField){
				var g = json.features[0];
				var fields_possible = ["name", "title", "label"];
				if(g.attributes){
					for(var i in fields_possible){
						if(g.attributes[fields_possible[i]]){
							nameField = fields_possible[i];
							break;
						}										
					}
				}				
			}
			
			for(var i in json.features){
				var json_feat = json.features[i];
				
				var g = new Graphic(json_feat);
				
				if(!g)
					continue;
				
				if(!g.attributes)
					g.attributes = {};
				
				g.attributes["name"] = (!nameField || !g.attributes[nameField]) ? 'n°'+(i+1) : g.attributes[nameField];
				if(g.symbol && g.symbol.type=="textsymbol")
					g.attributes["name"] = g.symbol.text;
				g.attributes["description"] = (!descriptionField || !g.attributes[descriptionField]) ? '' : g.attributes[descriptionField];
				
				if(g.symbol){
					this.drawBox.drawLayer.add(g);
				}
				else{
					var symbol = false;
					switch(g.geometry.type){
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
					if(symbol){
						g.setSymbol(symbol);
						this.drawBox.drawLayer.add(g);
					}
				}
			}
			
			this.setTab("list");	
		}
		catch(e){
			this.showMessage(this.nls.importErrorFileStructure, 'error');
			return false;
		}
	  },
	  
	  _importOnFileLoad:function(evt){
			var content = evt.target.result;
			this._importJsonContent(content);
			this.importFile.files[0]="";
	  },
	  
	  drawingsAsJson:function(asString){
		if(this.drawBox.drawLayer.graphics.length<1)
			return (asString) ? '' : false;
		
		var content = {
			"features":[],
			"displayFieldName" : "",
			"fieldAliases" : {},
			"spatialReference" : this.map.spatialReference.toJson(),
			"fields" : []
		};		
		
		for(var i in this.drawBox.drawLayer.graphics)
			content["features"].push(this.drawBox.drawLayer.graphics[i].toJson());
		
		if(asString){
			content = JSON.stringify(content);
		}
		return content;		
	  },
	  
	  
	  
	  export:function(){
		this.exportButton.href="#";
		if(this.drawBox.drawLayer.graphics.length < 1){
			this.showMessage(this.nls.importWarningNoExport0Draw, 'warning');
			return false;
		}
		else{	
			//If not IE
			if(!has("ie") && (!navigator.appName || navigator.appName != 'Microsoft Internet Explorer')){
				this.exportButton.href = 'data:application/json;charset=utf-8,'+this.drawingsAsJson(true);
				this.exportButton.target = "_BLANK";
				this.exportButton.download = this.config.exportFileName;
				return true;
			}
			
			//if IE, specific. (ie doesn't accept data in link href)
			this.exportButton.href = "#";
			this.exportButton.target = "";
			
			var iframe = this.exportIframeForIE;
			iframe = iframe.contentWindow || iframe.contentDocument; 
			
			iframe.document.open("application/json", "replace");
			iframe.document.write(this.drawingsAsJson(true));
			iframe.document.close();
			iframe.focus();
			iframe.document.execCommand('SaveAs', true, this.config.exportFileName);
			
			return false;
		}
	  },
	  
	  showMessage:function(msg, type){
		
		var class_icon = "message-info-icon";
		switch(type){
			case "error":
				class_icon = "message-error-icon";
				break;
			case "warning":
				class_icon = "message-warning-icon";
				break;
		}

		var content = '<i class="'+class_icon+'">&nbsp;</i>'+msg ;
		
		new Message({
			message:content
		});
	  },
	  
	  _switchGraphics:function(i1, i2){
		var g1 = this.drawBox.drawLayer.graphics[i1];
		var g2 = this.drawBox.drawLayer.graphics[i2];
		
		if(!g1 || !g2)
			return false;
		
		//Switch graphics
		this.drawBox.drawLayer.graphics[i1] = g2;
		this.drawBox.drawLayer.graphics[i2] = g1;
		
		//Redraw in good order
		for(var i in this.drawBox.drawLayer.graphics){
			if(i>=i1 || i >=i2)
				this.drawBox.drawLayer.graphics[i].getShape().moveToFront();		
		}
		return true;		
	  },
	  
	  onActionClick:function(evt){
		if(!evt.target || !evt.target.id)
			return;
		
		var tab = evt.target.id.split('--');
		var type = tab[0];
		var i = parseInt(tab[1]);
		
		var g = this.drawBox.drawLayer.graphics[i];
		this._editGraphic = g;
		this.setInfoWindow(false);
		
		switch(type){
			case 'draw-action-up':
				this._switchGraphics(i, i+1);
				this._generateDrawTable();
				break;
			case 'draw-action-down':
				this._switchGraphics(i, i-1);
				this._generateDrawTable();
				break;
			case 'draw-action-delete':
				if(!this.config.confirmOnDelete || confirm(this.nls.confirmDrawDelete + ".")){
					g.getLayer().remove(g);
					this._editGraphic = false;
					this.selectDrawing(false);
					this._generateDrawTable();
				}
				break;
			case 'draw-action-edit':
				this.setTab("edit");
				break;
			case 'draw-action-zoom':
				var extent = graphicsUtils.graphicsExtent([g]);
				this.map.setExtent(extent, true);	
				this._generateDrawTable();
				break;
		}
	  },

	  
	  _getSelectionSymbol:function(graphic){	
		if(!graphic || !graphic.symbol)
			return false;
		
		var select_color = new Color([5,230,242]);
		
		switch(graphic.geometry.type){
			case "point":
				if(graphic.symbol.type=="textsymbol"){
					var size=5;
					var style = SimpleMarkerSymbol.STYLE_DIAMOND;
				}
				else{
					var size=graphic.symbol.height;
					var style = SimpleMarkerSymbol.STYLE_SQUARE;
				}				
				return new SimpleMarkerSymbol(
					style, 
					size,
					new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, select_color, 2),
					new Color([0,0,0,0])
				);
				break;
			case "polyline":
				return new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, select_color, 2)
				break;
			case "polygon":
				return new SimpleFillSymbol(
					SimpleFillSymbol.STYLE_NULL,
					new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, select_color, 2),
					new Color([0,0,0,0])
				);
				break;
			case "extent":
				return new SimpleFillSymbol(
					SimpleFillSymbol.STYLE_NULL,
					new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, select_color, 2),
					new Color([0,0,0,0])
				);
				break;
			default:
				console.log("Pas de symbole de selection !!!!", graphic);
		}
		return graphic.symbol;
	  },
	  
	  selectDrawing:function(graphic){
		this.map.graphics.clear();
		
		if(!graphic)
			return;
		
		var select_graphic = new Graphic(graphic.toJson());
		var symbol = this._getSelectionSymbol(select_graphic);
		if(symbol){
			select_graphic.setSymbol(symbol);
			this.map.graphics.add(select_graphic);
		}
	  },
	  
      _resetUnitsArrays: function(){
        this.defaultDistanceUnits = [];
        this.defaultAreaUnits = [];
        this.configDistanceUnits = [];
        this.configAreaUnits = [];
        this.distanceUnits = [];
        this.areaUnits = [];
      },

      _bindEvents: function() {
        //bind DrawBox
        this.own(on(this.drawBox,'IconSelected',lang.hitch(this,this._onIconSelected)));
        this.own(on(this.drawBox,'DrawEnd',lang.hitch(this,this._onDrawEnd)));

        //bind symbol change events
        this.own(on(this.pointSymChooser,'change',lang.hitch(this,function(){
          this._setDrawDefaultSymbols();
		  this._phantomSymbol = this.pointSymChooser.getSymbol();
		  this._enableMapPreview(true);
        })));
        this.own(on(this.lineSymChooser,'change',lang.hitch(this,function(){
          this._setDrawDefaultSymbols();
		  this._enableMapPreview(false);
        })));
        this.own(on(this.fillSymChooser,'change',lang.hitch(this,function(){
          this._setDrawDefaultSymbols();
		   this._enableMapPreview(false);
        })));
        this.own(on(this.textSymChooser,'change',lang.hitch(this,function(symbol){
			this.drawBox.setTextSymbol(symbol);
			this._controlTextIsWritten();
			this._update_add_textSymbol();
			this._phantomSymbol = this.textSymChooser.symbol;
			this._enableMapPreview(true);
        })));

        //bind unit events
        this.own(on(this.showMeasure,'click',lang.hitch(this,this._setMeasureVisibility)));
		
		//bind list event
		this.onActionClick = lang.hitch(this, this.onActionClick);
		this._importOnFileLoad = lang.hitch(this, this._importOnFileLoad);
		
		//Draw plus !	
		this._update_add_textSymbol = lang.hitch(this, this._update_add_textSymbol);
		this._update_edit_textSymbol = lang.hitch(this, this._update_edit_textSymbol);
		
		this.textPlusPoliceNode.on("change", this._update_add_textSymbol);
		this.textAngleNode.on("change", this._update_add_textSymbol);
		on(this.textPlusBoldNode, "click", lang.hitch(this, this._onAddBoldClick));
		on(this.textPlusItalicNode, "click", lang.hitch(this, this._onAddItalicClick));
		on(this.textPlusUnderlineNode, "click", lang.hitch(this, this._onAddUnderlineClick));
		
		this.EditTextPlusPoliceNode.on("change", this._update_edit_textSymbol);
		this.EditTextAngleNode.on("change", this._update_edit_textSymbol);
		on(this.EditTextPlusBoldNode, "click", lang.hitch(this, this._onEditBoldClick));
		on(this.EditTextPlusItalicNode, "click", lang.hitch(this, this._onEditItalicClick));
		on(this.EditTextPlusUnderlineNode, "click", lang.hitch(this, this._onEditUnderlineClick));
		
      },
	  
	  _update_add_textSymbol:function(){
		var family = this.textPlusPoliceNode.value;
		var angle = this.textAngleNode.value;
		var weight = this._drawPlus["add"]["bold"] ? esri.symbol.Font.WEIGHT_BOLD : esri.symbol.Font.WEIGHT_NORMAL;
		var style = this._drawPlus["add"]["italic"] ? esri.symbol.Font.STYLE_ITALIC : esri.symbol.Font.STYLE_NORMAL;
		var decoration = this._drawPlus["add"]["underline"] ? 'underline' : 'none';
		
		this.textSymChooser.symbol.font.setFamily(family);
		this.textSymChooser.symbol.setAngle(angle);
		this.textSymChooser.symbol.font.setWeight(weight);
		this.textSymChooser.symbol.font.setStyle(style);
		this.textSymChooser.symbol.font.setDecoration(decoration);
		
		this.drawBox.setTextSymbol(this.textSymChooser.symbol);
		
		this.textSymChooser.textPreview.style.fontFamily = family;
		this.textSymChooser.textPreview.style['font-style'] = (this._drawPlus["add"]["italic"]) ? 'italic' : 'normal';
		this.textSymChooser.textPreview.style['font-weight'] = (this._drawPlus["add"]["bold"]) ? 'bold' : 'normal';
		this.textSymChooser.textPreview.style['text-decoration'] = (this._drawPlus["add"]["underline"]) ? 'underline' : 'none';
		this.textSymChooser.textPreview.style.transform = 'rotate(' + angle + 'deg)';
		this.textSymChooser.textPreview.style['-ms-transform'] = 'rotate(' + angle + 'deg)';
		
		this.textAnglePreviewNode.style['font-style'] = (this._drawPlus["add"]["italic"]) ? 'italic' : 'normal';
		this.textAnglePreviewNode.style['font-weight'] = (this._drawPlus["add"]["bold"]) ? 'bold' : 'normal';
		this.textAnglePreviewNode.style['text-decoration'] = (this._drawPlus["add"]["underline"]) ? 'underline' : 'none';
		this.textAnglePreviewNode.style.transform = 'rotate(' + angle + 'deg)';
		this.textAnglePreviewNode.style['-ms-transform'] = 'rotate(' + angle + 'deg)';
		
		if(this._phantomSymbol){
			this._phantomSymbol.font.setFamily(family);
			this._phantomSymbol.setAngle(angle);
			this._phantomSymbol.font.setWeight(weight);
			this._phantomSymbol.font.setStyle(style);
			this._phantomSymbol.font.setDecoration(decoration);
		}
	  },
	  
	  _update_edit_textSymbol:function(){
		var family = this.EditTextPlusPoliceNode.value;
		var angle = this.EditTextAngleNode.value;
		var weight = this._drawPlus["edit"]["bold"] ? esri.symbol.Font.WEIGHT_BOLD : esri.symbol.Font.WEIGHT_NORMAL;
		var style = this._drawPlus["edit"]["italic"] ? esri.symbol.Font.STYLE_ITALIC : esri.symbol.Font.STYLE_NORMAL;
		var decoration = this._drawPlus["edit"]["underline"] ? 'underline' : 'none';
		
		 
		this._EditSymbolChooser.symbol.font.setFamily(family);
		this._EditSymbolChooser.symbol.setAngle(angle);
		this._EditSymbolChooser.symbol.font.setWeight(weight);
		this._EditSymbolChooser.symbol.font.setStyle(style);
		this._EditSymbolChooser.symbol.font.setDecoration(decoration);
		
		this._EditSymbolChooser.textPreview.style.fontFamily = family;
		this._EditSymbolChooser.textPreview.style['font-style'] = (this._drawPlus["edit"]["italic"]) ? 'italic' : 'normal';
		this._EditSymbolChooser.textPreview.style['font-weight'] = (this._drawPlus["edit"]["bold"]) ? 'bold' : 'normal';
		this._EditSymbolChooser.textPreview.style['text-decoration'] = (this._drawPlus["edit"]["underline"]) ? 'underline' : 'none';
		this._EditSymbolChooser.textPreview.style.transform = 'rotate(' + angle + 'deg)';
		this._EditSymbolChooser.textPreview.style['-ms-transform'] = 'rotate(' + angle + 'deg)';
		
		this.EditTextAnglePreviewNode.style['font-style'] = (this._drawPlus["edit"]["italic"]) ? 'italic' : 'normal';
		this.EditTextAnglePreviewNode.style['font-weight'] = (this._drawPlus["edit"]["bold"]) ? 'bold' : 'normal';
		this.EditTextAnglePreviewNode.style['text-decoration'] = (this._drawPlus["edit"]["underline"]) ? 'underline' : 'none';
		this.EditTextAnglePreviewNode.style.transform = 'rotate(' + angle + 'deg)';
		this.EditTextAnglePreviewNode.style['-ms-transform'] = 'rotate(' + angle + 'deg)';
	  },
	  
	  _enableClass:function(elt, className, bool){
		if(elt.classList){
			if(bool)
				elt.classList.add(className);
			else
				elt.classList.remove(className);
			return;
		}
		elt.className = elt.className.replace(className,"").replace("  ", " ").trim();
		if(bool)
			elt.className += className;
	  },
	  
	 _onAddBoldClick:function(evt){
			this._drawPlus["add"]["bold"] = !this._drawPlus["add"]["bold"];
			this._enableClass(this.textPlusBoldNode, 'selected',this._drawPlus["add"]["bold"]);
			this._update_add_textSymbol();
		},
		_onAddItalicClick:function(evt){
			this._drawPlus["add"]["italic"] = !this._drawPlus["add"]["italic"];
			this._enableClass(this.textPlusItalicNode, 'selected',this._drawPlus["add"]["italic"]);
			this._update_add_textSymbol();
		},
		_onAddUnderlineClick:function(evt){
			this._drawPlus["add"]["underline"] = !this._drawPlus["add"]["underline"];
			this._enableClass(this.textPlusUnderlineNode, 'selected',this._drawPlus["add"]["underline"]);
			this._update_add_textSymbol();
		},
		_onEditBoldClick:function(evt){
			this._drawPlus["edit"]["bold"] = !this._drawPlus["edit"]["bold"];
			this._enableClass(this.EditTextPlusBoldNode, 'selected',this._drawPlus["edit"]["bold"]);
			this._update_edit_textSymbol();
		},
		_onEditItalicClick:function(evt){
			this._drawPlus["edit"]["italic"] = !this._drawPlus["edit"]["italic"];
			this._enableClass(this.EditTextPlusItalicNode, 'selected',this._drawPlus["edit"]["italic"]);
			this._update_edit_textSymbol();
		},
		_onEditUnderlineClick:function(evt){
			this._drawPlus["edit"]["underline"] = !this._drawPlus["edit"]["underline"];
			this._enableClass(this.EditTextPlusUnderlineNode, 'selected',this._drawPlus["edit"]["underline"]);
			this._update_edit_textSymbol();
		},
	  
	  _phantomPoint:false,
	  _phantomSymbol:false,
	  _phantomLayer:false,
	  _phantomHandle:false,
	  
	  _enableMapPreview:function(bool){
		if(!bool){
			if(this._phantomPoint)
				this._phantomPoint.hide();
			if(this._phantomHandle){
				dojo.disconnect(this._phantomHandle);
				this._phantomHandle = false;
			}
			return;
		}
		
		//Create layer
		if(!this._phantomLayer){
			this._phantomLayer = new GraphicsLayer({id:this.id+"__phantomLayer"});
			// this._phantomPoint
			var center = this.map.extent.getCenter();
			this._phantomPoint = new Graphic(center, this._phantomSymbol, {});
			this._phantomLayer.add(this._phantomPoint);
			this._phantomPoint.hide();
			
			this.map.addLayer(this._phantomLayer);
		}
		else{
			this._phantomPoint.setSymbol(this._phantomSymbol);
		}
		
		//Track mouse on map
		if(!this._phantomHandle){
			this._phantomHandle = on(this.map, 'mouse-move, mouse-out, mouse-over', lang.hitch(this, function(evt) {
			  if (this.state === 'opened') {
				switch (evt.type) {
				  case 'mousemove':
					if (this._phantomPoint) {
					  this._phantomPoint.setGeometry(evt.mapPoint);
					  this._phantomPoint.show();
					}
					break;
				  case 'mouseout':
					if (this._phantomPoint) {
					  this._phantomPoint.hide();
					}
					break;
				  case 'mouseover':
					if (this._phantomPoint) {
					  this._phantomPoint.setGeometry(evt.mapPoint);
					  this._phantomPoint.show();
					}
					break;
				}
			  }
			}));
		}
		
	  },

      _onIconSelected:function(target,geotype,commontype){
        this._setDrawDefaultSymbols();
        if(commontype === 'point'){
          this.viewStack.switchView(this.pointSection);
		  this._phantomSymbol = this.pointSymChooser.getSymbol();
		  this._enableMapPreview(true);
        }
        else if(commontype === 'polyline'){
          this.viewStack.switchView(this.lineSection);
		  this._enableMapPreview(false);
        }
        else if(commontype === 'polygon'){
          this.viewStack.switchView(this.polygonSection);
		  this._enableMapPreview(false);
        }
        else if(commontype === 'text'){
          this.viewStack.switchView(this.textSection);
		  this._controlTextIsWritten(); 
		  this._phantomSymbol = this.textSymChooser.getSymbol();
		  this._enableMapPreview(true);
        }
        this._setMeasureVisibility();
		
      },
	  
	  _controlTextIsWritten : function(){
		this.textSymChooser.inputText.value = this.nameField.value;
		
		var tr = this._parentByTag(this.textSymChooser.inputText, 'tr');
		if(tr)
			tr.style.display = 'none';
		
		var value = this.textSymChooser.inputText.value.trim();
		if(value==""){
			html.setStyle(this.nameField,'box-shadow','3px 3px 1px 1px rgba(200, 0, 0, 0.7)');
			this.nameField.focus();
		}
		else{
			html.setStyle(this.nameField,'box-shadow','none');
		}
	  },

      _onDrawEnd:function(graphic,geotype,commontype){
        var geometry = graphic.geometry;
		
		this._enableMapPreview(false);
		
		graphic.attributes = {
			"name":this.nameField.value,
			"description":this.descriptionField.value
		}
		
        if(geometry.type === 'extent'){
          var a = geometry;
          var polygon = new Polygon(a.spatialReference);
          var r=[[a.xmin,a.ymin],[a.xmin,a.ymax],[a.xmax,a.ymax],[a.xmax,a.ymin],[a.xmin,a.ymin]];
          polygon.addRing(r);
          geometry = polygon;
          commontype = 'polygon';
        }
        if(commontype === 'polyline'){
          if(this.showMeasure.checked){
            this._addLineMeasure(geometry);
          }
        }
        else if(commontype === 'polygon'){
          if(this.showMeasure.checked){
            this._addPolygonMeasure(geometry);
          }
        }
		else if(commontype == 'text' && this.textSymChooser.inputText.value.trim() == ""){
			//Message
			this.showMessage(this.nls.textWarningMessage, 'warning');
			
			//Remove empty feature (text symbol without text)
			graphic.getLayer().remove(graphic);
		}
		
		this.viewStack.switchView(false);
		this._setMeasureVisibility();
		this._saveInLocalStorage();
		this._editGraphic = graphic;
		this.setTab("list");
      },

      _initUnitSelect:function(){
        this._initDefaultUnits();
        this._initConfigUnits();
        var a = this.configDistanceUnits;
        var b = this.defaultDistanceUnits;
        this.distanceUnits = a.length > 0 ? a : b;
        var c = this.configAreaUnits;
        var d = this.defaultAreaUnits;
        this.areaUnits = c.length > 0 ? c : d;
        array.forEach(this.distanceUnits,lang.hitch(this,function(unitInfo){
          var option = {
            value:unitInfo.unit,
            label:unitInfo.label
          };
          this.distanceUnitSelect.addOption(option);
        }));

        array.forEach(this.areaUnits,lang.hitch(this,function(unitInfo){
          var option = {
            value:unitInfo.unit,
            label:unitInfo.label
          };
          this.areaUnitSelect.addOption(option);
        }));
      },

      _initDefaultUnits:function(){
        this.defaultDistanceUnits = [{
          unit: 'KILOMETERS',
          label: this.nls.kilometers
        }, {
          unit: 'MILES',
          label: this.nls.miles
        }, {
          unit: 'METERS',
          label: this.nls.meters
        }, {
          unit: 'FEET',
          label: this.nls.feet
        }, {
          unit: 'YARDS',
          label: this.nls.yards
        }];

        this.defaultAreaUnits = [{
          unit: 'SQUARE_KILOMETERS',
          label: this.nls.squareKilometers
        }, {
          unit: 'SQUARE_MILES',
          label: this.nls.squareMiles
        }, {
          unit: 'ACRES',
          label: this.nls.acres
        }, {
          unit: 'HECTARES',
          label: this.nls.hectares
        }, {
          unit: 'SQUARE_METERS',
          label: this.nls.squareMeters
        }, {
          unit: 'SQUARE_FEET',
          label: this.nls.squareFeet
        }, {
          unit: 'SQUARE_YARDS',
          label: this.nls.squareYards
        }];
      },

      _initConfigUnits:function(){
        array.forEach(this.config.distanceUnits,lang.hitch(this,function(unitInfo){
          var unit = unitInfo.unit;
          if(esriUnits[unit]){
            var defaultUnitInfo = this._getDefaultDistanceUnitInfo(unit);
            unitInfo.label = defaultUnitInfo.label;
            this.configDistanceUnits.push(unitInfo);
          }
        }));

        array.forEach(this.config.areaUnits,lang.hitch(this,function(unitInfo){
          var unit = unitInfo.unit;
          if(esriUnits[unit]){
            var defaultUnitInfo = this._getDefaultAreaUnitInfo(unit);
            unitInfo.label = defaultUnitInfo.label;
            this.configAreaUnits.push(unitInfo);
          }
        }));
      },

      _getDefaultDistanceUnitInfo:function(unit){
        for(var i=0;i<this.defaultDistanceUnits.length;i++){
          var unitInfo = this.defaultDistanceUnits[i];
          if(unitInfo.unit === unit){
            return unitInfo;
          }
        }
        return null;
      },

      _getDefaultAreaUnitInfo:function(unit){
        for(var i=0;i<this.defaultAreaUnits.length;i++){
          var unitInfo = this.defaultAreaUnits[i];
          if(unitInfo.unit === unit){
            return unitInfo;
          }
        }
        return null;
      },

      _getDistanceUnitInfo:function(unit){
        for(var i=0;i<this.distanceUnits.length;i++){
          var unitInfo = this.distanceUnits[i];
          if(unitInfo.unit === unit){
            return unitInfo;
          }
        }
        return null;
      },

      _getAreaUnitInfo:function(unit){
        for(var i=0;i<this.areaUnits.length;i++){
          var unitInfo = this.areaUnits[i];
          if(unitInfo.unit === unit){
            return unitInfo;
          }
        }
        return null;
      },

      _setMeasureVisibility:function(){
        html.setStyle(this.measureSection,'display','none');
        html.setStyle(this.areaMeasure,'display','none');
        html.setStyle(this.distanceMeasure,'display','none');
        var lineDisplay = html.getStyle(this.lineSection,'display');
        var polygonDisplay = html.getStyle(this.polygonSection,'display');
        if(lineDisplay === 'block'){
          html.setStyle(this.measureSection,'display','block');
          if(this.showMeasure.checked){
            html.setStyle(this.distanceMeasure,'display','block');
          }
        }
        else if(polygonDisplay === 'block'){
          html.setStyle(this.measureSection,'display','block');
          if(this.showMeasure.checked){
            html.setStyle(this.areaMeasure,'display','block');
            html.setStyle(this.distanceMeasure,'display','block');
          }
        }
      },

      _getPointSymbol: function() {
        return this.pointSymChooser.getSymbol();
      },

      _getLineSymbol: function() {
        return this.lineSymChooser.getSymbol();
      },

      _getPolygonSymbol: function() {
        return this.fillSymChooser.getSymbol();
      },

      _getTextSymbol: function() {
        return this.textSymChooser.getSymbol();
      },

      _setDrawDefaultSymbols: function() {
        this.drawBox.setPointSymbol(this._getPointSymbol());
        this.drawBox.setLineSymbol(this._getLineSymbol());
        this.drawBox.setPolygonSymbol(this._getPolygonSymbol());
      },

      onClose: function() {
        this.drawBox.deactivate();
      },

      _addLineMeasure:function(geometry){
        var a = Font.STYLE_ITALIC;
        var b = Font.VARIANT_NORMAL;
        var c = Font.WEIGHT_BOLD;
        var symbolFont = new Font("16px",a,b,c, "Courier");
        var fontColor = new Color([0,0,0,1]);
        var ext = geometry.getExtent();
        var center = ext.getCenter();
        var geoLine = webMercatorUtils.webMercatorToGeographic(geometry);
        var unit = this.distanceUnitSelect.value;
        var lengths = geodesicUtils.geodesicLengths([geoLine],esriUnits[unit]);
        var abbr = this._getDistanceUnitInfo(unit).label;
        var localeLength = jimuUtils.localizeNumber(lengths[0].toFixed(1));
        var length = localeLength + " " + abbr;
        var textSymbol = new TextSymbol(length,symbolFont,fontColor);
        var labelGraphic = new Graphic(center,textSymbol,{"name":textSymbol.text, "description":""},null);
        // var labelGraphic = new Graphic(center,textSymbol,null,null);
        // this.drawBox.addGraphic(labelGraphic);
        this.drawBox.drawLayer.add(labelGraphic);
      },

      _addPolygonMeasure:function(geometry){
        var a = Font.STYLE_ITALIC;
        var b = Font.VARIANT_NORMAL;
        var c = Font.WEIGHT_BOLD;
        var symbolFont = new Font("16px",a,b,c, "Courier");
        var fontColor = new Color([0,0,0,1]);
        var ext = geometry.getExtent();
        var center = ext.getCenter();
        var geoPolygon = webMercatorUtils.webMercatorToGeographic(geometry);
        var areaUnit = this.areaUnitSelect.value;
        var areaAbbr = this._getAreaUnitInfo(areaUnit).label;
        var areas = geodesicUtils.geodesicAreas([geoPolygon],esriUnits[areaUnit]);
        var localeArea = jimuUtils.localizeNumber(areas[0].toFixed(1));
        var area = localeArea + " " + areaAbbr;

        var polyline = new Polyline(geometry.spatialReference);
        var points = geometry.rings[0];
        points = points.slice(0,points.length-1);
        polyline.addPath(points);
        var geoPolyline = webMercatorUtils.webMercatorToGeographic(polyline);
        var lengthUnit = this.distanceUnitSelect.value;
        var lengthAbbr = this._getDistanceUnitInfo(lengthUnit).label;
        var lengths = geodesicUtils.geodesicLengths([geoPolyline],esriUnits[lengthUnit]);
        var localeLength = jimuUtils.localizeNumber(lengths[0].toFixed(1));
        var length = localeLength + " " + lengthAbbr;
        var text = area + "    " + length;
        var textSymbol = new TextSymbol(text,symbolFont,fontColor);
         var labelGraphic = new Graphic(center,textSymbol,{"name":textSymbol.text, "description":""},null);
        // var labelGraphic = new Graphic(center,textSymbol,null,null);
        // this.drawBox.addGraphic(labelGraphic);
        this.drawBox.drawLayer.add(labelGraphic);
      },
	  
	  _parentByTag:function(el, tagName) {
		  tagName = tagName.toLowerCase();
		  while (el && el.parentNode) {
			el = el.parentNode;
			if (el.tagName && el.tagName.toLowerCase() == tagName) {
			  return el;
			}
		  }
		  return null;
		},

      destroy: function() {
        if(this.drawBox){
          this.drawBox.destroy();
          this.drawBox = null;
        }
        if(this.pointSymChooser){
          this.pointSymChooser.destroy();
          this.pointSymChooser = null;
        }
        if(this.lineSymChooser){
          this.lineSymChooser.destroy();
          this.lineSymChooser = null;
        }
        if(this.fillSymChooser){
          this.fillSymChooser.destroy();
          this.fillSymChooser = null;
        }
        if(this.textSymChooser){
          this.textSymChooser.destroy();
          this.textSymChooser = null;
        }
        this.inherited(arguments);
      }
    });
  });