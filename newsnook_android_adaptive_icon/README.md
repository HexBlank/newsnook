# NewsNook — Android Adaptive Icon

This package intentionally contains **Adaptive Icon resources only**.

## Install
Copy the `res/` folder contents into `app/src/main/res/`, then set:

```xml
<application
    android:icon="@mipmap/ic_launcher"
    ... />
```

## Included
- API 26+ adaptive icon: background + foreground
- API 33+ themed icon support: monochrome layer
- Foreground and monochrome raster layers for mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi
- Editable 108×108 SVG source layers
- Mask previews

## Design notes
- Layer canvas: 108×108 dp
- Foreground artwork: approximately 62×49 dp, centered inside the 66×66 dp safe zone
- Background: solid `#1B2A4A`, full bleed
- No baked-in corner radius, circle, border, or outer shadow

## Compatibility note
Because this package contains no legacy launcher bitmap, apps that need to display a launcher icon on Android 7.1 / API 25 or lower should add a legacy fallback separately. This omission is intentional per the request for Adaptive Icon only.
