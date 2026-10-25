# Labojumu process

Mērķis: saglabāt oriģinālo tulkojumu nemainītu un veikt labojumus tā, lai katrs
grozījums būtu izsekojams, pārskatāms un atceļams.

## Trīs slāņi

| Slānis | Kur | Kas to maina |
| --- | --- | --- |
| **Oriģināls** | `content/lv/dp/` | neviens — sasalstināts ar tagu `original-1`, skat. `FROZEN.md` |
| **Labojumi** | `corrections/` | AI priekšlikumi un komitejas lēmumi |
| **Publikācija** | `lv/` (ģenerēta) | `node tools/build.mjs` |

Oriģināls netiek pārrakstīts. Vietne vienmēr prot parādīt gan oriģinālu, gan laboto
tekstu, gan starpību.

## Aplis

1. **Priekšlikumi.** `corrections/rounds/r1-<nodaļa>.json` satur priekšlikumus:
   katrs norāda meklējamo tekstu (`find`) un labojumu (`replace`), kategoriju,
   pamatojumu un pārliecību. `"all": true` aizstāj visas atrades.
2. **Recenzijas pakete.** `node tools/review.mjs r1-principle-of-creation` izveido
   vienu pašpietiekamu HTML failu mapē `review/`. Recenzents to atver pārlūkā,
   atzīmē *Pieņemt / Noraidīt*, vajadzības gadījumā labo formulējumu un nospiež
   *Eksportēt lēmumus*. Fails darbojas bez interneta un bez konta.
3. **Lēmumi.** `node tools/apply.mjs <eksportētais-fails.json>` saglabā lēmumus
   `corrections/rounds/r1-decisions-<recenzents>.json`. Pašu labojumu teksti vēl
   netiek mainīti.
4. **Būvēšana.** `node tools/build.mjs` piemēro tikai `accepted` lēmumus un izveido:
   - lapās slēdzi *Labotais / Oriģināls / Salīdzinājums*;
   - `/lv/izmainas/` — labojumu žurnālu ar pirms/pēc un pamatojumu.
5. **Apstiprināšana.** Pēc pārbaudes izveido tagu `text-r1` un publicē.

## Statuss

- `proposed` — gaida lēmumu (noklusējums),
- `accepted` — iekļauts publikācijā,
- `rejected` — noraidīts; paliek žurnālā, lai to pašu priekšlikumu neatkārtotu.

## Noteikumi

- Labojumi attiecas uz rindkopām, virsrakstiem un zemsvītras piezīmēm, nevis uz
  Markdown struktūru.
- Katrs priekšlikums ir atoms — viena parādība, viens pamatojums.
- Terminiem jāatbilst `glossary.json`.
- Komitejas pašu labojumi no recenzijas paketes tiek saglabāti atsevišķi
  (`r1-custom-*.json`) un pirms iekļaušanas kļūst par jauniem priekšlikumiem.

## Jauna nodaļa

1. Pievieno `corrections/rounds/r2-<nodaļa>.json` ar tādu pašu struktūru.
2. `node tools/review.mjs r2-<nodaļa>` un tālāk kā parasti.

## Pārbaude

`node tools/build.mjs` brīdina, ja kāds `find` vairs neatrodas tekstā — tas nozīmē,
ka oriģināls ir mainīts vai priekšlikums novecojis.
