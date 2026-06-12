// Torrentio GrayJay Plugin v1

const TORRENTIO_BASE = "https://torrentio.strem.fun";
const CINEMETA_BASE  = "https://v3-cinemeta.strem.io";

function buildTorrentioConfig() {
  var provider = (_settings.debridProvider || "none").trim();
  var apiKey   = (_settings.debridApiKey   || "").trim();
  var sort     = _settings.sortOrder || "quality";
  var parts    = ["sort=" + sort, "limit=3"];
  if (provider !== "none" && apiKey.length > 0) {
    parts.push(provider + "=" + apiKey);
  }
  return parts.join("|");
}

function cinemetaSearch(query, type) {
  try {
    var url  = CINEMETA_BASE + "/catalog/" + type + "/top/search=" + encodeURIComponent(query) + ".json";
    var resp = Http.GET(url, {});
    if (!resp.isOk) return [];
    return JSON.parse(resp.body).metas || [];
  } catch(e) { return []; }
}

function getStreams(imdbId, season, episode) {
  try {
    var cfg  = buildTorrentioConfig();
    var path = season != null
      ? "/stream/series/" + imdbId + ":" + season + ":" + episode + ".json"
      : "/stream/movie/"  + imdbId + ".json";
    var resp = Http.GET(TORRENTIO_BASE + "/" + cfg + path, {});
    if (!resp.isOk) return [];
    return JSON.parse(resp.body).streams || [];
  } catch(e) { return []; }
}

function parseResolution(text) {
  if (/4K|2160p/i.test(text)) return { w: 3840, h: 2160 };
  if (/1080p/i.test(text))    return { w: 1920, h: 1080 };
  if (/720p/i.test(text))     return { w: 1280, h: 720  };
  if (/480p/i.test(text))     return { w: 854,  h: 480  };
  return { w: 0, h: 0 };
}

function streamToSource(s) {
  var url = s.url || (s.infoHash ? "magnet:?xt=urn:btih:" + s.infoHash : null);
  if (!url) return null;
  var label = ((s.name || "") + " " + (s.title || "")).replace(/\n/g, " ");
  var res   = parseResolution(label);
  return new VideoUrlSource({
    url: url, name: label,
    width: res.w, height: res.h,
    bitrate: 0, duration: 0,
    container: "video/mp4", codec: ""
  });
}

function metaToVideo(meta, type) {
  var imdbId = meta.imdb_id || meta.id || "";
  var thumb  = meta.poster  || meta.background || "";
  return new PlatformVideo({
    id:         new PlatformID("Torrentio", imdbId, _settings.clientId),
    name:       meta.name || meta.title || "Unknown",
    thumbnails: new Thumbnails([new Thumbnail(thumb, 0)]),
    author:     new PlatformAuthorLink(
                  new PlatformID("Torrentio", type, _settings.clientId),
                  type === "movie" ? "Movies" : "TV Series",
                  TORRENTIO_BASE, ""
                ),
    uploadDate:  meta.year ? parseInt(String(meta.year)) : 0,
    url:         "torrentio://" + type + "/" + imdbId,
    isLive: false, viewCount: 0, duration: 0,
    description: meta.description || ""
  });
}

source.enable = function(conf, settings, savedState) {};

source.getHome = function() {
  var metas  = cinemetaSearch("2024", "movie").slice(0, 10);
  var videos = metas.map(function(m) { return metaToVideo(m, "movie"); });
  return new VideoPager(videos, false, {});
};

source.search = function(query) {
  if (!query || query.trim() === "") return new VideoPager([], false, {});
  var movies = cinemetaSearch(query, "movie").map(function(m)  { return metaToVideo(m, "movie");  });
  var series = cinemetaSearch(query, "series").map(function(m) { return metaToVideo(m, "series"); });
  var merged = [], max = Math.max(movies.length, series.length);
  for (var i = 0; i < max; i++) {
    if (i < movies.length) merged.push(movies[i]);
    if (i < series.length) merged.push(series[i]);
  }
  return new VideoPager(merged, false, { query: query });
};

source.getSearchCapabilities = function() {
  return { types: [Type.Feed.Mixed], sorts: [Type.Order.Chronological], filters: [] };
};

source.isVideoDetailsUrl = function(url) {
  return typeof url === "string" && url.indexOf("torrentio://") === 0;
};

source.getVideoDetails = function(url)
