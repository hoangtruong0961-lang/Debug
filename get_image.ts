import axios from "axios";
axios.get("https://ibb.co/Kc8bLGL0").then(r=>console.log(r.data.match(/https:\/\/i\.ibb\.co\/[^"]+/g)));
