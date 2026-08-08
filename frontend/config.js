const DEPLOYED_API_BASE = "https://hotelgovindkripa.onrender.com";
const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

window.HOTEL_API_BASE = localHosts.has(window.location.hostname)
  ? ""
  : DEPLOYED_API_BASE;
