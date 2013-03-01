var FTmeta,
    activeRecord = {},
    defaultMeasure = 'p1',
    activeMeasure = defaultMeasure,
    wsbase = 'http://maps.co.mecklenburg.nc.us/rest/',
    map,
    geojson,
    jsonData,
    info,
    legend,
    marker,
    chart;


$(document).ready(function() {

    // Load variable metadata JSON
    $.ajax({
        url: 'scripts/metrics.json?V=23',
        dataType: 'json',
        async: false,
        success: function (data) {
            FTmeta = data;
        }
    });

    // Load NPA GeoJSON
    $.ajax({
        url: 'scripts/npa.json?V=23',
        dataType: 'json',
        type: 'GET',
        async: false,
        success: function (data) {
            jsonData = data;
        }
    });

    // Placeholder extension for crap browsers
    $('input, textarea').placeholder();

     // Add metrics to sidebar and report list
    $.each(FTmeta, function (index) {
        if (this.style.breaks.length > 0) {
            $('.sidenav p[data-group=' + this.category + ']').append('<li><a href="javascript:void(0)" class="measure-link" data-measure="' + this.field + '">' + this.title + ' <i></i></a></li>');
            $('#modalReport optgroup[label=' + this.category.toProperCase() + ']').append('<option value="' + this.field + '">' + this.title + '</option>');
        }
    });

    // sort metrics
    $('.sidenav p').each(function () {
        $('li', this).tsort();
    });
    $('#modalReport optgroup').each(function () {
        $('option', this).tsort();
    });

    // report event handlers
    $('#report_metrics optgroup').click(function (e) { $(this).children().prop('selected', 'selected');  });
    $('#report_metrics optgroup option').click(function (e) { e.stopPropagation(); });
    $('#all_metrics').change(function () {
        $(this).is(':checked') ? $('#report_metrics optgroup option').prop('selected', 'selected') : $('#report_metrics optgroup option').prop('selected', false);
    });

    // Set default metric display
    updateData(FTmeta[defaultMeasure]);
    calcAverage(defaultMeasure);
    barChart(FTmeta[defaultMeasure]);
    $('a[data-measure=' + defaultMeasure + ']').children('i').addClass('icon-chevron-right');

    // Sidebar events
    $('a.measure-link').on('click', function (e) {
        $('a.measure-link').children('i').removeClass('icon-chevron-right');
        $(this).children('i').addClass('icon-chevron-right');
        if ($(window).width() <= 767 ) { $('html, body').animate({ scrollTop: $('#data').offset().top }, 1000); }
        activeMeasure = $(this).data('measure');
        changeMeasure($(this).data('measure'));
        e.stopPropagation();
    });
    $('.sidenav li p').on('click', function (e) { e.stopPropagation(); });
    $('.sidenav li.metrics-dropdown').on('click', function () {
        $(this).addClass('active').siblings().removeClass('active');
        $(this).siblings().children('p').each(function () {
            if (!$(this).is(':hidden')) { $(this).animate({ height: 'toggle' }, 250); }
        });
        $(this).children('p').animate({ height: 'toggle' }, 250);
    });

    // Modal events
    $(".talkback").click(function () {
        $('#modalHelp').modal('hide');
        $('#modalTalkback').modal('show');
    });
    $(".reports").click(function () {
        $('#modalData').modal('hide');
        $('#modalReport').modal('show');
    });
    $(".reportToData").click(function () {
        $('#modalReport').modal('hide');
        $('#modalData').modal('show');
    });

    // Geolocation
    if (!Modernizr.geolocation) {
        $(".gpsarea").hide();
    } else {
        $(".gps").click(function () {
            map.locate({ enableHighAccuracy: true });
        });
    }

    // popover events
    $('*[rel=popover]').popover();
    $(".popover-trigger").hover(function () {
            if ( $(window).width() > 979 ) { $( $(this).data("popover-selector") ).popover("show"); }
        }, function(){
            $( $(this).data("popover-selector") ).popover("hide");
        }
    );

    // Window resize for SVG charts
    $(window).smartresize(function () {
        // charts
        if ( $("#details_chart svg").width() !== $("#data").width() ) { barChart(FTmeta[activeMeasure]); }
    });

    // Opacity slider
    $("#opacity_slider").slider({ range: "min", value: 80, min: 25, max: 100, stop: function (event, ui) {
            geojson.setStyle(style);
            if (activeRecord.id) { highlightSelected(getNPALayer(activeRecord.id)); }
            legend.update();
        }
    }).sliderLabels('Map', 'Data');

    // Feedback from submit
    $("#talkback").submit(function (e) {
        e.preventDefault();
        $('#modalTalkback').modal('hide');
        $.ajax({
            type: "POST",
            url: "php/feedback.php",
            data: { inputName: $("#inputName").val(), inputEmail: $("#inputEmail").val(), inputURL: window.location.href, inputFeedback: $("#inputFeedback").val() }
        });
    });

    // jQuery UI Autocomplete
    $("#searchbox").click(function () { $(this).select(); });
    $.widget( "custom.catcomplete", $.ui.autocomplete, {
        _renderMenu: function( ul, items ) {
            var that = this,
                currentCategory = "";
            $.each( items, function( index, item ) {
                if ( item.category != currentCategory ) {
                    ul.append( "<li class='ui-autocomplete-category'>" + item.responsetype + "</li>" );
                    currentCategory = item.category;
                }
                that._renderItemData( ul, item );
            });
        }
    });
    $("#searchbox").catcomplete({
        minLength: 1,
        delay: 400,
        autoFocus: true,
        source: function(request, response) {
            if (request.term.length > 3) {
                $.ajax({
                    url: wsbase + 'v4/ws_geo_ubersearch.php',
                    dataType: 'jsonp',
                    data: {
                        searchtypes: 'address,library,school,park,geoname,cast,nsa,intersection,pid,business',
                        query: request.term
                    },
                    success: function(data) {
                        if (data.length > 0) {
                            response($.map(data, function(item) {
                                return {
                                    label: item.name,
                                    gid: item.gid,
                                    responsetype: item.type,
                                    lng: item.lng,
                                    lat: item.lat
                                };
                            }));
                        } else {
                            response($.map([{}], function(item) {
                                if (isNumber(request.term)) {
                                    // Needs more data
                                    return { label: 'More information needed for search.', responsetype: "I've got nothing" };
                                } else {
                                    // No records found
                                    return { label: "No records found.", responsetype: "I've got nothing" };
                                }
                            }));
                        }
                    }
                });
            }
            else {
                $.ajax({
                    url: wsbase + "v2/ws_geo_attributequery.php",
                    dataType: "jsonp",
                    data: {
                        table: "neighborhoods_data",
                        fields: "id as gid, id as name, 'NPA' as type",
                        parameters: "id = " + request.term
                    },
                    success: function(data) {
                        if (data.length > 0) {
                            response($.map(data, function(item) {
                                return {
                                    label: item.name,
                                    gid: item.gid,
                                    responsetype: item.type
                                };
                            }));
                        } else {
                            response($.map([{}], function(item) {
                                return { label: "No records found. I might need more information.", responsetype: "I've got nothing" };
                            }));
                        }
                    }
                });
            }
        },
        select: function(event, ui) {
            if (ui.item.lat) {
                locationFinder(ui.item);
            }
            else if (ui.item.gid) {
                changeNeighborhood(ui.item.gid);
            }

        }
    });

});

/*
    Window load events
 */
$(window).load(function(){
    // load map
    mapInit();

    // Process any legacy hash, if not process arguments
    // burn this out layer
    if ( window.location.hash.length > 1 ) {
        hashRead();
    }
    else {
        historyNav();
    }

    // set up history API
    if (Modernizr.history) {
        // history is supported; do magical things
        $(window).bind("popstate", function() {
            // reset if no args
            if ( !getURLParameter("npa") && !getURLParameter("variable") ) {
                resetOverview();
            }
            else {
                historyNav();
            }
        });
    }
});


/*
    Read args on load and popstate
*/
function historyNav() {
    // run neighborhood
    if ( getURLParameter("npa") ) {
        changeNeighborhood(getURLParameter("npa"), false);
    }
    // run variable
    if ( getURLParameter("variable") ) {
        changeMeasure(getURLParameter("variable"), false);
    }
}


/*
    Hash reading and writing
    burn this out later
*/
function hashRead() {
    theHash = window.location.hash.replace("#","").split("/");

    // Process the neighborhood number
    if (theHash[2] && theHash[2].length > 0) {
        if (theHash[2].indexOf(",") == -1) {
            changeNeighborhood(theHash[2], true);
        }
    }
    // Process the metric
    if (theHash[1].length > 0) {
        changeMeasure(theHash[1]);
    }
    // clear out old hash nonsense
    window.location.hash = "";
}

/* reset to overview */
function resetOverview() {
    $(".measure-info").hide();
    activeRecord = {};
    barChart(FTmeta[activeMeasure]);
    geojson.setStyle(style);
    map.setView([35.260, -80.807], 10);
}

/*
    Change active measure
*/
function changeMeasure(measure, setHistory) {
    if(typeof(setHistory)==='undefined') setHistory = true;
    activeMeasure = measure;

    // activate sidebar etc. if not already there
    if ( $('a[data-measure=' + measure + ']').parent("li").parent("p").is(':hidden') ) {
        $('a[data-measure=' + measure + ']').parent("li").parent("p").parent("li").trigger("click");
    }
    if (!$('a[data-measure=' + measure + ']').children("i").hasClass("icon-chevron-right")) {
        $("a.measure-link").children("i").removeClass("icon-chevron-right");
        $('a[data-measure=' + measure + ']').children("i").addClass("icon-chevron-right");
    }

    // get average if haven't already
    if (!FTmeta[activeMeasure].style.avg) calcAverage(activeMeasure);
    geojson.setStyle(style);
    legend.update();
    info.update();
    var layer = getNPALayer(activeRecord.id);
    updateData(FTmeta[activeMeasure]);
    if (activeRecord.id) highlightSelected(layer);

    // pushstate
    if (Modernizr.history && setHistory) {
        history.pushState(null, null, "?npa=" + (activeRecord["id"] ? activeRecord["id"] : "") + "&variable=" + activeMeasure);
    }
}

/*
    Change active neighborhood
*/
function changeNeighborhood(npaid, setHistory) {
    if(typeof(setHistory)==='undefined') setHistory = true;
    var layer = getNPALayer(npaid);
    assignData(layer.feature.properties);
    $(".measure-info").show();
    updateData(FTmeta[activeMeasure]);
    highlightSelected(layer);
    $('#report_neighborhood').val(npaid);
    zoomToFeature(layer.getBounds());

    // pushstate
    if (Modernizr.history && setHistory) {
        history.pushState(null, null, "?npa=" + (activeRecord["id"] ? activeRecord["id"] : "") + "&variable=" + activeMeasure);
    }

}

/*
    Assign data to active record
 */
function assignData(data) {
    $.each(data, function(key, value){
        activeRecord[key] = value;
    });
}


/*
    Update detailed data
*/
function updateData(measure) {
    if (activeRecord.id) {
        $("#selectedNeighborhood").html("Neighborhood Profile Area " + activeRecord.id);
        $("#selectedValue").html( prettyMetric(activeRecord[measure.field], activeMeasure) );
    }
    barChart(measure);

    // set neighborhood overview
    $("#selectedMeasure").html(measure.title);
    $("#indicator_description").html(measure.description);

    // set details info
    $("#indicator_why").html(measure.importance);
    $("#indicator_technical").empty();
    if (measure.tech_notes && measure.tech_notes.length > 0) $("#indicator_technical").append('<p>' + measure.tech_notes + '</p>');
    if (measure.source && measure.source.length > 0) $("#indicator_technical").append('<p>' + measure.source + '</p>');
    $("#indicator_resources").empty();

    // Links
    if (measure.links) {
        $("#indicator_resources").append(measure.links);
    }

    // Show stuff
    $("#welcome").hide();
    $("#selected-summary").show();
}

/*
    Bar Chart
*/
function barChart(measure) {
    var data, theTitle, theColors;
    if (jQuery.isEmptyObject(activeRecord) || activeRecord[activeMeasure] === null) {
        data = google.visualization.arrayToDataTable([
            [null, 'County Average'],
            [null,  FTmeta[measure.field].style.avg ]
        ]);
        theTitle = prettyMetric(Math.round(FTmeta[measure.field].style.avg), activeMeasure);
        theColors = ["#DC3912"];
    }
    else {
        data = google.visualization.arrayToDataTable([
            [null, 'NPA ' + activeRecord.id, 'County Average'],
            [null,  parseFloat(activeRecord[measure.field]), Math.round(FTmeta[measure.field].style.avg) ]
        ]);
        theTitle = prettyMetric(activeRecord[measure.field], activeMeasure);
        theColors = ["#0283D5", "#DC3912"];
    }

    var options = {
        title: theTitle,
        titlePosition: 'out',
        titleTextStyle: { fontSize: 14 },
        //vAxis: { title: null,  titleTextStyle: {color: 'red'}},
        hAxis: { format: "#.##", minValue: FTmeta[measure.field].style.breaks[0] },
        width: "95%",
        height: 150,
        legend: 'bottom',
        colors: theColors,
        chartArea: { left: 20, right: 20, width: '100%' }
    };

    if (!chart) { chart = new google.visualization.BarChart(document.getElementById('details_chart')); }
    chart.draw(data, options);
}




/********************************************


    Map Stuff


********************************************/
function mapInit() {

    // initialize map
    map = new L.Map('map', {
        center: [35.260, -80.807],
        zoom: 10,
        minZoom: 9,
        maxZoom: 16
    });
    map.attributionControl.setPrefix(false).setPosition("bottomleft");

    //  Add Base Layer
    L.tileLayer( "http://maps.co.mecklenburg.nc.us/mbtiles/mbtiles-server.php?db=meckbase-desaturated.mbtiles&z={z}&x={x}&y={y}",
     { "attribution": "<a href='http://emaps.charmeck.org'>Mecklenburg County GIS</a>" } ).addTo( map );

    // Add geojson data
    geojson = L.geoJson(jsonData, { style: style, onEachFeature: onEachFeature }).addTo(map);

    // Locate user position via GeoLocation API
    map.on('locationfound', function(e) {
        var radius = e.accuracy / 2;
        performIntersection(e.latlng.lat, e.latlng.lng);
    });

    // Hover information
    info = L.control();
    info.onAdd = function (map) {
        this._div = L.DomUtil.create('div', 'info'); // create a div with a class "info"
        this.update();
        return this._div;
    };
    info.update = function (props) {
        this._div.innerHTML = '<h4>' + FTmeta[activeMeasure].title + '</h4>' +  (props && props[activeMeasure] != undefined ?
            'NPA ' + props.id + ': ' + prettyMetric(props[activeMeasure], activeMeasure) + '<br>County Average: ' + prettyMetric(FTmeta[activeMeasure].style.avg, activeMeasure) :
            props && props[activeMeasure] == undefined ? 'NPA ' + props.id + '<br />No data available.' :
            '');
    };
    info.addTo(map);

    // Legend
    legend = L.control({position: 'bottomright'});
    legend.onAdd = function (map) {
        this._div = L.DomUtil.create('div', 'info legend');
        this.update();
        return this._div;
    };
    legend.update = function() {
        var theLegend = '<i style="background: #666666; opacity: ' + ($("#opacity_slider").slider( "option", "value" ) + 10) / 100 + '"></i> <span id="legend-">N/A</span><br>';
        $.each(FTmeta[activeMeasure].style.breaks, function(index, value) {
            theLegend += '<i style="background:' + FTmeta[activeMeasure].style.colors[index] + '; opacity: ' + ($("#opacity_slider").slider( "option", "value" ) + 10) / 100 + '"></i> <span id="legend-' + index + '">' +
                prettyMetric(value, activeMeasure)  + (FTmeta[activeMeasure].style.colors[index + 1] ? '&ndash;' + prettyMetric(FTmeta[activeMeasure].style.breaks[index + 1], activeMeasure) + '</span><br>' : '+</span>');
        });
        this._div.innerHTML = theLegend;
    };
    legend.addTo(map);
}

/* zoom to bounds */
function zoomToFeature(bounds) {
    map.fitBounds(bounds);
}

/*
    Add marker
*/
function addMarker(lat, lng) {
    if (marker) {
        try { map.removeLayer(marker); }
        catch(err) {}
    }
    marker = L.marker([lat, lng]).addTo(map);
}

/*
    Get xy NPA intersection via web service
*/
function performIntersection(lat, lon) {
    url = wsbase + 'v1/ws_geo_pointoverlay.php?geotable=neighborhoods&callback=?&format=json&srid=4326&fields=id&parameters=&x=' + lon + '&y=' + lat;
    $.getJSON(url, function(data) {
        if (data.total_rows > 0) {
            changeNeighborhood(data.rows[0].row.id);
            addMarker(lat, lon);
        }
    });
}

/*
    Get NPA feature
*/
function getNPALayer(idvalue) {
    var layer;
    $.each(geojson._layers, function() {
        if (this.feature.properties.id == idvalue) layer = this;
    });
    return layer;
}

/*
    Find locations
*/
function locationFinder(data) {
    performIntersection(data.lat, data.lng);
}

/*
    Map NPA geojson decoration functions
*/
function onEachFeature(feature, layer) {
    layer.on({
        mouseover: highlightFeature,
        mouseout: resetHighlight,
        click: selectFeature
    });
}
function style(feature) {
    return {
        fillColor: getColor(feature.properties[activeMeasure]),
        weight: 1,
        opacity: 1,
        color: '#f5f5f5',
        fillOpacity: $("#opacity_slider").slider("value") / 100
    };
}
function getColor(d) {
    var color = "";
    var colors = FTmeta[activeMeasure].style.colors;
    var breaks = FTmeta[activeMeasure].style.breaks;
    $.each(breaks, function(index, value) {
        if (value <= d && d !== null) {
            color = colors[index];
            return;
        }
    });
    if (color.length > 0) return color;
    else return "#666666";
}
function highlightFeature(e) {
    var layer = e.target;
    if (!activeRecord || (activeRecord && activeRecord.id != e.target.feature.properties.id)) layer.setStyle({
        weight: 3,
        color: '#ffcc00'
    });
    if (!L.Browser.ie && !L.Browser.opera) {
        layer.bringToFront();
    }
    info.update(layer.feature.properties);
}
function resetHighlight(e) {
    var layer = e.target;
     if (!activeRecord || (activeRecord && activeRecord.id != layer.feature.properties.id)) layer.setStyle({
        weight: 1,
        color: '#f5f5f5'
    });
    info.update();
}
function highlightSelected(layer) {
    geojson.setStyle(style);
    layer.setStyle({
        weight: 7,
        color: '#0283D5',
        dashArray: ''
    });
    if (!L.Browser.ie && !L.Browser.opera) {
        layer.bringToFront();
    }
}
function selectFeature(e) {
    var layer = e.target;
    changeNeighborhood(layer.feature.properties.id);
}
