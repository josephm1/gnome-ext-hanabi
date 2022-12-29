#!/usr/bin/env gjs

/**
 * Copyright (C) 2022 Jeff Shee (jeffshee8969@gmail.com)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

imports.gi.versions.Gtk = "4.0";
imports.gi.versions.GdkX11 = "4.0";
imports.gi.versions.WebKit2 = "5.0";

const { Gtk, Gdk, Gio, WebKit2, GLib } = imports.gi;
const WebView = WebKit2.WebView;

const applicationId = "io.github.jeffshee.hanabi-renderer";

let extSettings = null;
const extSchemaId = "io.github.jeffshee.hanabi-extension";

const settingsSchemaSource = Gio.SettingsSchemaSource.get_default();
if (settingsSchemaSource.lookup(extSchemaId, false)) {
    extSettings = Gio.Settings.new(extSchemaId);
}

const isDebugMode = extSettings ? extSettings.get_boolean("debug-mode") : true;

let windowed = false;
let windowConfig = { width: 1920, height: 1080 };
let codePath = "";

//I added this
var webView;

//edit to index.html -J
let videoPath = extSettings ? extSettings.get_string("video-path") : "";
let volume = extSettings ? extSettings.get_int("volume") / 100.0 : 0.5;
let mute = extSettings ? extSettings.get_boolean("mute") : false;
let nohide = false;

let lastCommand = null;
let errorFound = false;
let window = null;

function debug(...args) {
    if (isDebugMode) print(...args);
}

function parseCommandLine(argv) {
    for (let arg of argv) {
        if (!lastCommand) {
            switch (arg) {
                case "-M":
                case "--mute":
                    mute = true;
                    debug(`mute = ${mute}`);
                    break;
                case "-N":
                case "--nohide":
                    // Launch renderer in standalone mode without hiding
                    nohide = true;
                    debug(`nohide = ${nohide}`);
                    break;
                case "-W":
                case "--windowed":
                case "-P":
                case "--codepath":
                case "-F":
                case "--filepath":
                case "-V":
                case "--volume":
                    lastCommand = arg;
                    break;
                default:
                    print(`Argument ${arg} not recognized. Aborting.`);
                    errorFound = true;
                    break;
            }
            continue;
        }
        switch (lastCommand) {
            case "-W":
            case "--windowed":
                windowed = true;
                let data = arg.split(":");
                windowConfig = {
                    width: parseInt(data[0]),
                    height: parseInt(data[1]),
                };
                debug(`windowed = ${windowed}, windowConfig = ${windowConfig}`);
                break;
            case "-P":
            case "--codepath":
                codePath = arg;
                debug(`codepath = ${codePath}`);
                break;
            case "-F":
            case "--filepath":
                videoPath = arg;
                debug(`filepath = ${videoPath}`);
                break;
            case "-V":
            case "--volume":
                volume = Math.max(0.0, Math.min(1.0, parseFloat(arg)));
                debug(`volume = ${volume}`);
                break;
        }
        lastCommand = null;
        if (errorFound) break;
    }
}

function usingX11() {
    return (
        Gdk.Display.get_default().constructor.$gtype.name === "GdkX11Display"
    );
}

class WebWallpaperWindow {
    constructor(app) {
        this._app = app;
        this._window = null;
        this._label = null;
        // Create a new WebView widget
        webView = new WebView();

        // Load a webpage into the WebView widget
        webView.load_uri("https://www.w3schools.com/");

        // Load CSS with custom style
        let cssProvider = new Gtk.CssProvider();
        cssProvider.load_from_file(
            Gio.File.new_for_path(
                GLib.build_filenamev([codePath, "stylesheet.css"])
            )
        );
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(),
            cssProvider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        );

        //video path to web path should be changed but leave it for now
        extSettings?.connect("changed", (settings, key) => {
            switch (key) {
                case "video-path":
                    videoPath = settings.get_string(key);
                    this.setFilePath(videoPath);
                    break;
                case "mute":
                    mute = settings.get_boolean(key);
                    this.setMute(mute);
                    break;
                case "volume":
                    volume = settings.get_int(key) / 100.0;
                    this.setVolume(volume);
                    break;
            }
        });
    }

    _buildUI() {
        this._window = new Gtk.ApplicationWindow({
            application: this._app,
            title: nohide ? "Hanabi Renderer" : `@${applicationId}!0,0;BM`,
            defaultHeight: windowConfig.height,
            defaultWidth: windowConfig.width,
            fullscreened: !windowed,
            decorated: nohide ? true : false,
        });

        // Transparent* (opacity=0.01) window background
        this._windowContext = this._window.get_style_context();
        this._windowContext.add_class("desktopwindow");

        // Set the WebView widget as the child of the window
        this._window.set_child(webView);
    }

    setFilePath(filePath) {
        const file = Gio.File.new_for_path(filePath);
        // if (this._play) {
        //     this._play.set_uri(file.get_uri());
        //     this._play.play();
        // } else if (this._media) {
        //     // FIXME: not playing
        //     this._media.file = file;
        //     this._media.play();
        // }
    }

    //Looks good from here -J
    getWidget() {
        this._buildUI();
        return this._window;
    }

    hideX11windowTaskbar() {
        // `minimize()` is guarded now. This will cause the window fails to minimize.
        // https://gitlab.gnome.org/GNOME/mutter/-/commit/7ff1c04c8fc6148d5a940601ffa2ea98f04f6548
        if (usingX11()) {
            this._window.connect("realize", (window) => {
                const gdkWindow = window.get_surface();
                gdkWindow.set_skip_pager_hint(true);
                gdkWindow.set_skip_taskbar_hint(true);
            });
        }
    }
}

const renderer = new Gtk.Application({
    application_id: applicationId,
    flags: Gio.ApplicationFlags.HANDLES_COMMAND_LINE,
});

renderer.connect("activate", (app) => {
    let activeWindow = app.activeWindow;

    if (!activeWindow) {
        window = new WebWallpaperWindow(app);
        activeWindow = window.getWidget();
    }

    activeWindow.present();
});

renderer.connect("command-line", (app, commandLine) => {
    let argv = [];
    argv = commandLine.get_arguments();
    parseCommandLine(argv);
    if (!errorFound) {
        renderer.activate();
        commandLine.set_exit_status(0);
    } else commandLine.set_exit_status(1);
});

renderer.run(ARGV);

if (!errorFound) {
    0;
} else {
    1;
}
