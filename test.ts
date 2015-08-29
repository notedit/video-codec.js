/// <reference path="api.ts" />
/// <reference path="camera.ts" />
/// <reference path="renderer.ts" />

class Test {
    src_renderer: Renderer;
    src_stat: HTMLDivElement;
    src_video_info: VideoInfo;
    dst_renderer: Renderer;

    constructor() {}

    init () {
        this.src_renderer = new Renderer(<HTMLCanvasElement>document.getElementById('source'));
        this.dst_renderer = new Renderer(<HTMLCanvasElement>document.getElementById('decoded'));
        this.src_stat = <HTMLDivElement>document.getElementById('src_info');

        document.getElementById('play').addEventListener('click', () => {
            this._play();
        });
        document.getElementById('encdec').addEventListener('click', () => {
            this._encode_and_decode();
        });
    }

    _play() {
        this._open_reader().then(([reader, video_info]) => {
            this.src_video_info = video_info;
            this.src_renderer.init(video_info);
            this._update_src_stat(0, 0);
            var counter = 0;
            var fps = 0;
            var start = Date.now();
            var read_frame= () => {
                reader.read().then((ev) => {
                    ++counter;
                    this.src_renderer.draw(ev);
                    window.setTimeout(() => {
                        read_frame();
                    }, 0);

                    var now = Date.now();
                    if (now - start >= 1000) {
                        fps = counter / ((now - start) / 1000);
                        start = now;
                        counter = 0;
                    }
                    this._update_src_stat(ev.timestamp, fps);
                }, (err) => {
                    console.log('read failed:', err);
                });
            };
            read_frame();
        }, (e) => {
            alert('failed:' + e);
        });
    }

    _encode_and_decode() {
        var encoder = new Worker('openh264_encoder.js');
        var decoder = new Worker('openh264_decoder.js');
        this._open_reader().then(([reader, video_info]) => {
            this.src_video_info = video_info;
            this.src_renderer.init(video_info);
            this.dst_renderer.init(video_info);
            var counter = 0;
            var fps = 0;
            var start = Date.now();
            var encode_frame = () => {
                reader.read().then((ev) => {
                    ++counter;
                    this.src_renderer.draw(ev);
                    encoder.postMessage(ev);
                    var now = Date.now();
                    if (now - start >= 1000) {
                        fps = counter / ((now - start) / 1000);
                        start = now;
                        counter = 0;
                    }
                    this._update_src_stat(ev.timestamp, fps);
                }, (err) => {
                    console.log('read failed:', err);
                });
            };
            encoder.onmessage = (ev) => {
                if (ev.data.status == 0) {
                    this._update_src_stat(0, 0);
                    encoder.onmessage = (ev) => {
                        if (ev.data.status == 0) {
                            if (ev.data.data) {
                                decoder.postMessage({
                                    data: ev.data.data
                                }, [ev.data.data]);
                            } else {
                                encode_frame();
                            }
                        }
                    };
                    encode_frame();
                } else {
                    console.log('failed: encoder init', ev);
                }
            };
            decoder.onmessage = (ev) => {
                if (ev.data.status == 0) {
                    if (ev.data.data) {
                        this.dst_renderer.draw(ev.data);
                    }
                }
                encode_frame();
            };
            encoder.postMessage({
                width: video_info.width,
                height: video_info.height,
                fps_num: video_info.fps_num,
                fps_den: video_info.fps_den,
            });
        }, (e) => {
            alert('failed:' + e);
        });
    }

    _open_reader(): Promise<[IReader, VideoInfo]> {
        var resolution = (<HTMLSelectElement>document.getElementById('camera-resolution')).value.split('x');
        var width = parseInt(resolution[0]), height = parseInt(resolution[1]);
        return new Promise((resolve, reject) => {
            var reader = new Camera();
            reader.open({
                width: width,
                height: height
            }).then((video_info) => {
                resolve([reader, video_info]);
            }, reject);
        });
    }

    _update_src_stat(timestamp: number, fps: number) {
        var txt = this._timestamp_to_string(timestamp)
            + ' (size:' + this.src_video_info.width + 'x' + this.src_video_info.height
            + ', fps:' + fps.toFixed(2) + ')';
        if (!this.src_stat.firstChild)
            this.src_stat.appendChild(document.createTextNode(''));
        this.src_stat.firstChild.textContent = txt;
    }

    _timestamp_to_string(timestamp: number) {
        var m = Math.floor(timestamp / 60);
        var s = ('0' + (Math.floor(timestamp) % 60)).substr(-2);
        var ms = ('00' + (timestamp * 1000).toFixed(0)).substr(-3);
        return m + ':' + s + '.' + ms;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    var main = new Test();
    main.init();
});