from jinja2 import Environment, DictLoader

MACRO_TEMPLATE = \
"""{%- macro channel(channel_name, channel, options=None) %}
<{{ channel_name }}>
    <SourceChannelName>{{ channel }}</SourceChannelName>
    {%- if options is mapping %}
    <ContrastEnhancement>
        <Normalize>
            <VendorOption name="algorithm">{{ options.algorithm|default("StretchToMinimumMaximum") }}</VendorOption>
            <VendorOption name="minValue">{{ options.minValue|default(0) }}</VendorOption>
            <VendorOption name="maxValue">{{ options.maxValue|default(1) }}</VendorOption>
        </Normalize>
        <GammaValue>{{ options.gamma|default(0.5) }}</GammaValue>
    </ContrastEnhancement>
    {%- endif %}
</{{ channel_name }}>
{% endmacro -%}

{%- macro colormap(attrs) -%}
<ColorMapEntry {% if attrs is mapping %}{% for k,v in attrs.iteritems() %} {{k}}="{{v}}"{% endfor %}{% endif %}/>
{%- endmacro -%}"""

RASTER_DOCUMENT_TEMPLATE = \
"""{% import "macros.xml" as macros %}
<?xml version="1.0" encoding="utf-8" ?>
<StyledLayerDescriptor version="1.0.0"
 xsi:schemaLocation="http://www.opengis.net/sld StyledLayerDescriptor.xsd"
 xmlns="http://www.opengis.net/sld"
 xmlns:ogc="http://www.opengis.net/ogc"
 xmlns:xlink="http://www.w3.org/1999/xlink"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <NamedLayer>
    <Name>{{ name }}</Name>
    <UserStyle>
        <Title>{{ title }}</Title>
        <IsDefault>1</IsDefault>
        <FeatureTypeStyle>
        <Rule>
            <RasterSymbolizer>
                <Opacity>{{ opacity|default(1.0) }}</Opacity>
                <ChannelSelection>
                {%- for c in channels -%}
                    {{ macros.channel(c.name, c.band, c.options|default(None)) }}
                {%- endfor %}
                </ChannelSelection>
                {%- if colormap is defined %}
                <ColorMap type="{{ colormap_type|default("ramp") }}">
                    {% for cm in colormap %}
                    {{ macros.colormap(cm) }}
                    {% endfor %}
                </ColorMap>
                {%- endif %}
            </RasterSymbolizer>
        </Rule>
        </FeatureTypeStyle>
    </UserStyle>
    </NamedLayer>
</StyledLayerDescriptor>"""

SLDTemplates = Environment(loader=DictLoader({
    "macros.xml": MACRO_TEMPLATE,
    "raster_sld.xml": RASTER_DOCUMENT_TEMPLATE
}))


def get_multiband_raster_sld(
        name, title=None, bands=(1, 2, 3),
        range=(0, 1), gamma=1.0, opacity=1.0,
        channelNames=("RedChannel", "GreenChannel", "BlueChannel")):


    # Make sure range is a list of ranges - this test
    # is buggy and should be fixed.
    if not all(isinstance(e, list) or isinstance(e, tuple)
               for e in range):
        range = [range] * len(bands)

    # Set title default if it wasn't passed in
    if title is None:
        title = "Style for bands {} of layer {}".format(
            ",".join(str(b) for b in bands), name)

    # Bands parameter must be a tuple or list
    assert isinstance(bands, (list, tuple))

    # Bands must be length of 3
    assert(len(bands) == 3)

    # Gamma must be a number or list
    assert isinstance(gamma, (int, float, list))

    # Opacity must be a number
    assert isinstance(opacity, (int, float))

    # All bands must be integers greater than 1
    assert all(isinstance(e, int) and e > 0 for e in bands), \
        "Bands must be specified as integer indexes starting from 1!"

    # All ranges must be of length 2
    assert all(len(e) == 2 for e in range), \
        "Range must be a list of length {}".format(len(bands))

    # Ranges and bands must be the same length
    assert len(bands) == len(range), \
        "Number of bands ({}) must be equal to number of ranges ({})!".format(
            len(bands), len(range))

    # Make sure gamma is a list the same length as the list of bands
    try:
        assert len(gamma) == len(bands), \
            "Number of gamma ({}) must be equal to number of bands ({})".format(
                len(gamma), len(bands))
    except TypeError:
        gamma = [gamma] * len(bands)

    template = SLDTemplates.get_template("raster_sld.xml")

    template_params = {
        "title": title,
        "name": name,
        "opacity": opacity,
        "channels": []}

    for n, b, r, g in zip(channelNames, bands, range, gamma):
        template_params['channels'].append({
            "name": n,
            "band": b,
            "options": {
                "minValue": r[0],
                "maxValue": r[1],
                "gamma": g
            }})

    return template.render(**template_params)


def get_single_band_raster_sld(
        name, band, title=None, opacity=1.0,
        channelName="GrayChannel", colormap=None,
        colormap_type="ramp"):

    # Set title default if it wasn't passed in
    if title is None:
        title = "Style for band {} of layer {}".format(band, name)

    # Get the raster template
    template = SLDTemplates.get_template("raster_sld.xml")

    template_params = {
        "title": title,
        "name": name,
        "opacity": opacity,
        "channels": [
            {"name": channelName,
             "band": band}],
    }

    if colormap is not None:
        template_params['colormap'] = colormap
        template_params['colormap_type'] = colormap_type

    return template.render(**template_params)



#if __name__ == "__main__":
#     print get_single_band_raster_sld(
#         'nVDI', band=9, colormap=[
#             {"color": "#000000", "quantity": "95", "alpha": 0.1},
#             {"color": "#0000FF", "quantity": "110"},
#             {"color": "#00FF00", "quantity": "135"},
#             {"color": "#FF0000", "quantity": "160"},
#             {"color": "#FF00FF", "quantity": "185"}])
#    print get_multiband_raster_sld('rgb', range=[(1, 2), (2, 3), (3,4)], gamma=(0.1, 0.2, 0.3), opacity=0.5)