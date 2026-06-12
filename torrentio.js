var TORRENTIO = "https://torrentio.strem.fun";
var CINEMETA = "https://v3-cinemeta.strem.io";

function buildConfig() {
  var provider = (_settings.debridProvider || "none").trim();
  var apiKey = (_settings.debridApiKey || "").trim();
  var parts = ["sort=quality", "limit=3"];
  if (provider !== "none" && apiKey.length > 0) {
    parts.push(provider + "=" + apiKey);
  }
  return parts.join("|");
}

function cinemetaSearch(query, type) {
  try {
    var url = CINEMETA + "/catalog/" + type + "/top/search=" + encodeURIComponent(query) + ".json";
    var resp = Http.GET(url, {});
    if (!resp.isOk) return [];
    return JSON.parse(resp.body).metas || [];
  } catch(e) { return []; }
}

function getStreams(imdbId, season, episode) {
  try {
    var cfg = buildConfig();
    var path;
    if (season != null) {
      path = "/stream/series/" + imdbId + ":" + season + ":" + episode + ".json";
    } else {
      path = "/stream/movie/" + imdbId + ".json";
    }
    var resp = Http.GET(TORRENTIO + "/" + cfg + path, {});
    if (!resp.isOk) return [];
    return JSON.parse(resp.body).streams || [];
  } catch(e) { return []; }
}

function toSource(s) {
  var url = s.url || (s.infoHash ? "magnet:?xt=urn:btih:" + s.infoHash : null);
  if (!url) return null;
  var label = ((s.name || "") + " " + (s.title || "")).replace(/\n/g, " ");
  var w = 0, h = 0;
  if (/2160p|4K/i.test(label)) { w = 3840; h = 2160; }
  else if (/1080p/i.test(label)) { w = 1920; h = 1080; }
  else if (/720p/i.test(label)) { w = 1280; h = 720; }
  return new VideoUrlSource({
    url: url, name: label,
    width: w, height: h,
    bitrate: 0, duration: 0,
    container: "video/mp4", codec: ""
  });
}

function toVideo(meta, type) {
  var id = meta.imdb_id || meta.id || "";
  var thumb = meta.poster || "";
  return new PlatformVideo({
    id: new PlatformID("Torrentio", id, _settings.clientId),
    name: meta.name || meta.title || "Unknown",
    thumbnails: new Thumbnails([new Thumbnail(thumb, 0)]),
    author: new PlatformAuthorLink(
      new PlatformID("Torrentio", type, _settings.clientId),
      type === "movie" ? "Movies" : "TV Series",
      TORRENTIO, ""
    ),
    uploadDate: meta.year ? parseInt(String(meta.year)) : 0,
    url: "torrentio://" + type + "/" + id,
    isLive: false, viewCount: 0, duration: 0,
    description: meta.description || ""
  });
}

source.enable = function(conf, settings, savedState) {};

source.getHome = function() {
  try {
    var metas = cinemetaSearch("2024", "movie").slice(0, 10);
    var videos = metas.map(function(m) { return toVideo(m, "movie"); });
    return new VideoPager(videos, false, {});
  } catch(e) {
    return new VideoPager([], false, {});
  }
};

source.search = function(query) {
  if (!query || query.trim() === "") return new VideoPager([], false, {});
  var movies = cinemetaSearch(query, "movie").map(function(m) { return toVideo(m, "movie"); });
  var series = cinemetaSearch(query, "series").map(function(m) { return toVideo(m, "series"); });
  var merged = [];
  var max = Math.max(movies.length, series.length);
  for (var i = 0; i < max; i++) {
    if (i < movies.length) merged.push(movies[i]);
    if (i < series.length) merged.push(series[i]);
  }
  return new VideoPager(merged, false, {});
};

source.getSearchCapabilities = function() {
  return {
    types: [Type.Feed.Mixed],
    sorts: [Type.Order.Chronological],
    filters: []
  };
};

source.isVideoDetailsUrl = function(url) {
  return typeof url === "string" && url.indexOf("torrentio://") === 0;
};

source.getVideoDetails = function(url) {
  var stripped = url.replace("torrentio://", "");
  var slash = stripped.indexOf("/");
  var type = stripped.substring(0, slash);
  var imdbId = stripped.substring(slash + 1);
  var meta = {};
  try {
    var r = Http.GET(CINEMETA + "/meta/" + type + "/" + imdbId + ".json", {});
    if (r.isOk) meta = JSON.parse(r.body).meta || {};
  } catch(e) {}
  var raw = type === "movie" ? getStreams(imdbId, null, null) : getStreams(imdbId, 1, 1);
  var sources = raw.map(toSource).filter(function(s) { return s !== null; });
  return new PlatformVideoDetails({
    id: new PlatformID("Torrentio", imdbId, _settings.clientId),
    name: meta.name || meta.title || imdbId,
    thumbnails: new Thumbnails([new Thumbnail(meta.poster || "", 0)]),
    author: new PlatformAuthorLink(
      new PlatformID("Torrentio", type, _settings.clientId),
      type === "movie" ? "Movies" : "TV Series",
      TORRENTIO, ""
    ),
    uploadDate: meta.year ? parseInt(String(meta.year)) : 0,
    url: url, isLive: false, viewCount: 0, duration: 0,
    description: meta.description || "",
    video: new VideoSourceDescriptor(sources),
    live: null, dash: null, hls: null, subtitles: []
  });
};

source.isChannelUrl = function(url) { return false; };
source.getChannel = function(url) { throw new Error("Not supported"); };
source.searchSuggestions = function(q) { return []; };
