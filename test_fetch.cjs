const providers = [
  {
      "name": "Refetcher API (Default)",
      "endpointPath": "/",
      "enabled": true,
      "apiKey": "pc_live_wHlUz6HkeV_D-7ewVkeF7AQp0J6AP0hY",
      "apiKeyLocation": "header_x_api_key",
      "urlParamName": "url",
      "headersJson": "{\n  \"Accept\": \"application/json\",\n  \"Content-Type\": \"application/json\"\n}",
      "method": "POST"
  }
];

fetch('https://api.refetcher.com/v1/instagram', {
  method: 'POST',
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-Api-Key': 'pc_live_wHlUz6HkeV_D-7ewVkeF7AQp0J6AP0hY'
  },
  body: JSON.stringify({ url: 'https://www.instagram.com/reel/Db9F9JnDGFi/' })
}).then(res => res.text()).then(text => console.log(text)).catch(console.error);
