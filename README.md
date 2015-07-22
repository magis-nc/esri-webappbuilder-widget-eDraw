# esri-webappbuilder-widget-eDraw
Ehanced draw widget for WebApp Builder for Arcgis.

Fork and modifications of the official widget draw for WebApp Builder for Arcgis :
http://doc.arcgis.com/en/web-appbuilder/create-apps/widget-draw.htm

## Improvments :
- add name and description fields on drawings
- enable infowindow on drawings (selection)
- on text drawing, no insert if no name.
- on modification : enable geometry update (with snapping if wanted : CTRL) and preview symbology changes on the fly
- list
    - add list of all drawings
    - actions on each drawing : modify / delete / up / down / zoom
    - all drawings : zoom or delete
    - on drawing infowindow -> select drawing in list
    - on zoom on a drawing -> select drawing on map (and show infoWindow)
- import/export : allow users to export or import drawings (json format)
- localStorage
    - dynamic saving on each drawing add/delete/update
    - on widget load : load drawings saved in local Storage
- draws plus (from Larry Stout https://geonet.esri.com/people/Larry_Stout)
    - preview under mouse when adding text or point
    - for text, add font choice, font angle, bold, italic, placement and underline options.
- checkbox to hide drawing's layer (and therefore widget UI)
- add of Nautical unit

## configuration :
- export file name.
- Confirm on delete. A confirm dialog when user delete drawing(s) ?
- Enable import/export. Let the user import or export drawings ?
- Enable local storage. enable auto-saving in local storage and loading saved drawings on widget load.
    - Local storage key : let empty or set a name :
        - if empty, all apps with eDraw widgets share the same local storage (apps on the same server)
        - if not empty, all apps with the same key share the same local storage (apps on the same server)
- Choose availables font families in text plus 
        
## Installation :
Add eDraw folder in your webApp Builder client\stemapp\widgets folder.
Download Release here : 
https://github.com/magis-nc/esri-webappbuilder-widget-eDraw/releases/tag/v1.1.3

## Demo :
http://apps.magis.nc/maps/wab-widgets/?extent=17918900%2C-2706198%2C19092972%2C-2154016%2C102100
