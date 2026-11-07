# Astiavuokraus Lahden alueella – Paimelan Martat

Staattinen sivusto (GitHub Pages) Paimelan Marttojen astiaston vuokraukselle.

## Rakenne

| Tiedosto | Sisältö |
|---|---|
| `index.html` | Sivusto: astiasto, hinnasto, varauskalenteri, nouto, UKK, yhteystiedot |
| `admin.html` | Salasanalla suojattu varausten ylläpito |
| `js/kalenteri.js` | Kalenterin kuukausinäkymä (värit, tooltip) |
| `js/admin.js` | Ylläpidon toiminnot (tallennus GitHubiin) |
| `data/varaukset.json` | Varaukset – ylläpito päivittää tätä |
| `data/admin-config.json` | Syntyy käyttöönotossa: salasanalla salattu GitHub-avain |

## Julkaisu GitHub Pagesissa

Settings → Pages → *Deploy from a branch* → `main` / `(root)`.
Osoite: `https://jaripeltola.github.io/astiavuokraus-lahti/`

## Ylläpidon käyttöönotto (kerran)

1. GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token
   - Repository access: *Only select repositories* → `astiavuokraus-lahti`
   - Permissions → Repository → **Contents: Read and write**
   - Expiration: pisin mahdollinen (merkitse kalenteriin uusiminen)
2. Avaa `…/admin.html`, syötä avain ja valitse ylläpidon salasana (pitkä!).
3. Jatkossa ylläpitoon kirjaudutaan pelkällä salasanalla millä tahansa laitteella.

Avaimen vanhentuessa: poista `data/admin-config.json` repositoriosta ja tee käyttöönotto uudelleen.

## Oma domain (myöhemmin)

1. Lisää tiedosto `CNAME`, sisältö: `astiavuokrauslahti.com`
2. Domainin DNS: A-tietueet `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` ja `www` CNAME → `jaripeltola.github.io`
3. Settings → Pages → Custom domain + *Enforce HTTPS*
4. Lisää sivusto Google Search Consoleen ja lähetä `sitemap.xml`.

`index.html`:n canonical-osoite, `robots.txt` ja `sitemap.xml` osoittavat jo valmiiksi domainiin `astiavuokrauslahti.com` – vaihda, jos domain on eri.

## Kuvat

Kuvat ovat kansiossa `images/` (astiat1–3.jpg, martat-logo.png).
