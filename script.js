// const url = 'https://corsproxy.io/?' + encodeURIComponent('https://mspmag.com/promotions/restaurantweek')
const proxy = 'https://corsproxy.io/?'
const url = 'https://mspmag.com/promotions/restaurantweek/restaurant-week-2023/'
const $app = document.getElementById('app')
const $template = document.getElementById('template')

function handleError() {
  $app.innerHTML = `<p>Error scraping the API. Try again or visit the direct link: <a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a></p>`
}

async function getAPI() {
  const res = await fetch(proxy + encodeURIComponent(url))
  const html = await res.text()
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html');
    const $scripts = Array.from(doc.querySelectorAll('script'))
    const $script = $scripts.filter($script => $script.innerHTML.trim().startsWith('var _mp_require = {')).pop()
    const json = JSON.parse($script.innerHTML.trim().replace(/^var _mp_require =/, '').replace(/;$/, ''))
    return Promise.resolve(json['config']['js/page_roundup_location']['locations_url'])
  } catch (e) {
    throw e
  }
}

async function getRestaurants(api) {
  let data = []
  while (true) {
    const res = await fetch(proxy + encodeURIComponent(api))
    const json = await res.json()
    data = data.concat(json.results)
    if (!json.more) break
    api = api.replace(/\?.*$/, `?page=${parseInt(json.page) + 1}`)
  }
  return data
}

(async () => {
  const api = await getAPI().catch(handleError)
  const restaurants = await getRestaurants(api + '?page=1').catch(handleError)
  console.log(api, restaurants)
  $app.innerHTML = Mustache.render($template.innerHTML, { restaurants })
})();
