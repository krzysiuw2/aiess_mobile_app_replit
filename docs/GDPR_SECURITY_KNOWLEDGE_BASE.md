# AIESS - Baza Wiedzy RODO, Dane w UE, Certyfikaty i Dokumenty Compliance

> Status: dokument roboczy / wewnetrzna baza wiedzy compliance  
> Cel: podstawa do regulaminu, polityki prywatnosci, strony o bezpieczenstwie, odpowiedzi dla klientow i dalszych dokumentow prawnych  
> Zakres: obecna architektura produktu, z celem `RODO + dane w UE`  
> Uwaga: to nie jest porada prawna. Dokument porzadkuje fakty techniczne i oficjalne materialy dostawcow.

---

## 1. Jak uzywac tego dokumentu

Ten plik ma dwa zastosowania:

- jako wewnetrzna baza wiedzy o rzeczywistych komponentach, przeplywach danych i dokumentach compliance,
- jako zrodlo do przygotowania materialow publicznych bez nadmiernego ujawniania stacku technologicznego.

Dokument jest przygotowany tak, aby mogl byc skopiowany do innego projektu lub workspace jako material samowystarczalny. Nie wymaga czytania innych lokalnych plikow repo, aby zrozumiec jego wnioski i rekomendacje.

Najwazniejsza zasada redakcyjna:

- `nie publikujemy pelnej mapy stacku`, jesli nie jest to konieczne prawnie lub kontraktowo,
- `publikujemy certyfikaty, regiony przetwarzania, podstawy prawne, kategorie dostawcow i srodki ochrony`,
- `na zewnatrz opisujemy funkcje systemu`, a nie szczegoly implementacyjne.

Przyklad:

- zamiast: `uzywamy AWS IoT Core, Bedrock, DynamoDB i InfluxDB`,
- lepiej: `korzystamy z zarzadzanych uslug chmurowych hostowanych w regionach UE do uwierzytelniania, przetwarzania danych aplikacji, analityki telemetrycznej, komunikacji z urzadzeniami i funkcji AI`.

Pelna mapa techniczna moze byc udostepniana:

- wewnetrznie,
- pod NDA,
- w due diligence,
- audytorom lub klientom, ktorzy maja uzasadniona potrzebe poznania szczegolow architektury.

---

## 2. Streszczenie wykonawcze

Na dzisiaj najbardziej wiarygodna i praktyczna linia compliance dla AIESS brzmi:

- aplikacja korzysta z dobranych uslug chmurowych hostowanych w regionach europejskich,
- przetwarzanie opiera sie na standardowych regionach UE, a nie na `European Sovereign Cloud`,
- obecny model jest sensowny dla celu `RODO + dane w UE`,
- nie nalezy obiecywac publicznie, ze `zadne dane nigdy nie opuszczaja UE`, dopoki nie zostanie to potwierdzone usluga po usludze i umowa po umowie,
- nalezy opierac przekaz na: regionach UE, DPA, SCC, raportach SOC, certyfikatach ISO, kontrolach bezpieczenstwa i modelu shared responsibility.

W obecnym stanie architektury najwazniejsze jest rozroznienie pomiedzy:

- `wewnetrznym obrazem systemu`, ktory zawiera konkretne uslugi i zaleznosci,
- `publicznym opisem compliance`, ktory ma byc wystarczajaco rzetelny prawnie, ale nie powinien stanowic dokumentacji dla konkurencji.

---

## 3. Obecna architektura i komponenty

### 3.1. Zrodlo ustalen

Ponizszy opis architektury jest juz znormalizowany i zebrany w tym dokumencie. Przy przenoszeniu go do innego projektu nie trzeba dolaczac dodatkowych plikow technicznych, o ile celem jest praca na poziomie compliance, polityk, materialow webowych i dokumentow prawnych.

### 3.2. Wewnetrzna mapa komponentow

Ponisza tabela jest `do uzytku wewnetrznego`. Nie nalezy publikowac jej w tej postaci na stronie lub w regulaminie.


| Funkcja systemu                       | Implementacja wewnetrzna                             | Typ danych                                                          | Czy moze obejmowac dane osobowe                               | Region / hosting                                               |
| ------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| Uwierzytelnianie i konto uzytkownika  | Supabase Auth + PostgreSQL                           | email, login, profil, relacje user-device                           | Tak                                                           | AWS EU West (Ireland) - `eu-west-1` przez Supabase             |
| Rejestr urzadzen i uprawnienia        | Supabase PostgreSQL                                  | `devices`, `device_users`, role, lokalizacja obiektu                | Tak, po powiazaniu z uzytkownikiem                            | AWS EU West (Ireland) - `eu-west-1` przez Supabase             |
| Konfiguracja obiektu / instalacji     | AWS backend + DynamoDB + geokodowanie                | adres, wspolrzedne, parametry baterii, falownika, taryfy            | Tak                                                           | AWS EU Central (Frankfurt) - `eu-central-1`                    |
| Telemetria i analityka                | InfluxDB Cloud                                       | telemetryka energetyczna, statystyki, historia, ceny energii        | Tak, po powiazaniu z kontem, lokalizacja lub obiektem         | AWS EU Central (Frankfurt) - `eu-central-1` przez InfluxDB     |
| AI chat i operacje AI                 | AWS API Gateway + Lambda + Bedrock Agent             | prompty, `site_id`, odpowiedzi, dane konfiguracyjne i telemetryczne | Potencjalnie tak                                              | AWS EU Central (Frankfurt) - `eu-central-1`                    |
| Harmonogramy i sterowanie urzadzeniem | AWS API + backend harmonogramow + warstwa IoT/shadow | reguly, limity, tryby pracy, desired state                          | Zwykle dane operacyjne, ale sa zwiazane z konkretnym obiektem | AWS EU Central (Frankfurt) - `eu-central-1`                    |
| Geokodowanie adresu                   | Amazon Location Service                              | adres, latitude, longitude                                          | Tak                                                           | AWS EU Central (Frankfurt) - `eu-central-1`                    |
| Dane pogodowe pomocnicze              | Open-Meteo                                           | wspolrzedne, dane pogodowe, prognoza                                | Tak, gdy powiazane z lokalizacja klienta                      | Zalezne od uslugi zewnetrznej                                  |
| Lokalne przechowywanie w aplikacji    | storage po stronie urzadzenia mobilnego / web        | sesja auth, wybrane urzadzenie, ustawienia                          | Tak                                                           | Urzadzenie uzytkownika                                         |


### 3.3. Publicznie bezpieczne odpowiedniki opisu

Gdy trzeba opisac architekture publicznie, warto stosowac ponizsze zamienniki:


| Opis wewnetrzny          | Opis publiczny / compliance-safe                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| Supabase Auth + Postgres | dostawca uwierzytelniania i relacyjnych danych aplikacji hostowany w regionie europejskim |
| AWS Bedrock              | zarzadzana usluga AI hostowana w regionie UE dla funkcji wspomagajacych aplikacje         |
| AWS IoT / shadow         | warstwa bezpiecznej komunikacji i sterowania urzadzeniami                                 |
| DynamoDB                 | zarzadzany magazyn konfiguracji systemowej hostowany w regionie UE                        |
| InfluxDB Cloud           | zarzadzana baza telemetryczna hostowana w regionie UE                                     |


---

## 4. Kategorie danych i ich znaczenie pod RODO

### 4.1. Dane bezposrednio osobowe

Do tej kategorii zaliczaja sie w szczegolnosci:

- adres e-mail,
- dane logowania,
- identyfikatory kont,
- dane profilu, np. `full_name`, `phone`, `avatar_url`,
- dane adresowe obiektu, jesli pozwalaja zidentyfikowac osobe lub gospodarstwo,
- wspolrzedne geograficzne powiazane z klientem lub lokalizacja instalacji.

### 4.2. Dane, ktore staja sie danymi osobowymi po powiazaniu

W praktyce AIESS przetwarza tez dane, ktore same w sobie nie zawsze sa klasycznym PII, ale po powiazaniu z kontem, urzadzeniem lub adresem nalezy je traktowac z duza ostroznoscia:

- telemetryka energetyczna,
- historia zuzycia lub produkcji energii,
- ustawienia i harmonogramy pracy magazynu energii,
- identyfikatory instalacji,
- dane lokalizacyjne,
- tresc rozmow z AI, jesli uzytkownik wprowadzi dane osobowe lub dane o swojej instalacji.

### 4.3. Dane o nizszej wrazliwosci

Do tej grupy mozna zaliczyc np.:

- ogolne dane rynkowe, takie jak ceny energii,
- dane pogodowe bez identyfikacji konkretnej osoby.

### 4.4. Praktyczny wniosek RODO

Dla AIESS bezpieczne jest przyjecie, ze:

- dane kont i profili to `dane osobowe`,
- dane lokalizacyjne i techniczne obiektu moga byc `danymi osobowymi`,
- telemetryka energetyczna powiazana z kontem lub adresem powinna byc traktowana jako `dane osobowe lub co najmniej dane wrazliwe operacyjnie`,
- tresc rozmow AI nalezy traktowac ostroznie, bo uzytkownik moze tam wpisywac informacje osobowe lub poufne.

---

## 5. Regiony przetwarzania i bezpieczne twierdzenia publiczne

### 5.1. Stan obecny

Na podstawie ustalonej architektury i zweryfikowanych ustalen biznesowych:

- backend AWS jest opisywany jako dzialajacy w `eu-central-1`,
- InfluxDB Cloud jest osadzony w `AWS EU Frankfurt`,
- Supabase przechowuje dane uzytkownika w `AWS EU West (Ireland) - eu-west-1`,
- funkcje AI sa uruchamiane przez AWS Bedrock w `AWS EU Central (Frankfurt) - eu-central-1`, ale model Anthropic jest obecnie skonfigurowany jako `EU cross-region inference profile`, a nie `single-region only`.

### 5.2. Co mozna bezpiecznie napisac publicznie

Bezpieczne sformulowania:

- `Dane aplikacji sa hostowane i przetwarzane z wykorzystaniem wybranych regionow europejskich dostawcow chmurowych.`
- `System korzysta z dostawcow oferujacych mechanizmy zgodne z RODO, w tym umowy powierzenia przetwarzania danych, standardowe klauzule umowne i certyfikacje bezpieczenstwa.`
- `Dane sa przechowywane i przetwarzane przede wszystkim w regionach UE, zgodnie z konfiguracja wybranych uslug oraz warunkami umownymi dostawcow.`

### 5.3. Czego nie nalezy obiecywac bez dodatkowej weryfikacji

Nie nalezy automatycznie deklarowac:

- `zadne dane nigdy nie opuszczaja UE`,
- `wszyscy dostawcy gwarantuja w 100% zero transferow poza UE`,
- `wszystkie uslugi sa sovereign / lokalne / izolowane od calego swiata`,
- `certyfikaty dostawcow oznaczaja automatyczna zgodnosc calej aplikacji`.

Powod:

- AWS w `Privacy Features of AWS Services` wyraznie wskazuje, ze czesc uslug moze obejmowac transfery lub wyjatki specyficzne dla uslugi,
- Supabase w DPA posluguje sie sformulowaniem `stored and primarily Processed in that region`, a nie absolutnym `processed only in that region under all circumstances`,
- InfluxDB publicznie potwierdza region i kontrole bezpieczenstwa, ale sam region nie jest rownoznaczny z globalna obietnica `EU only under every scenario`.

### 5.4. Wazna uwaga dla funkcji AI

W przypadku uslug AI nalezy wewnetrznie potwierdzic:

- czy nie jest wlaczone `cross-region inference`,
- czy nie sa wlaczone dodatkowe opcje rozwoju / ulepszania uslugi, ktore moga prowadzic do transferu danych,
- jaka jest finalna konfiguracja produkcyjna modelu i endpointu.

To nie musi byc ujawniane publicznie, ale powinno byc potwierdzone wewnetrznie.

#### Potwierdzony stan AIESS na 2026-03-06

Na podstawie lokalnej konfiguracji `AWS CLI`, konfiguracji agenta Bedrock oraz zweryfikowanych ustalen architektonicznych:

- konto AWS dziala domyslnie w `AWS EU Central (Frankfurt) - eu-central-1`,
- agent Bedrock jest uruchomiony w `eu-central-1`,
- agent korzysta z profilu `eu.anthropic.claude-sonnet-4-6`,
- jest to `EU inference profile`, a nie profil globalny,
- profil routuje inferencje pomiedzy wybranymi regionami UE, a nie tylko do samego Frankfurtu.

Praktyczny wniosek:

- obecna konfiguracja wyglada na `EU-only`, ale nie na `single-region only`,
- na dzisiaj nie nalezy opisywac tej konfiguracji jako `AI tylko we Frankfurcie`,
- najuczciwsze sformulowanie brzmi: `funkcje AI sa uruchamiane przez AWS Bedrock w ramach europejskiego profilu inferencyjnego obejmujacego wybrane regiony UE`.

#### Czy da sie zejsc do bardziej restrykcyjnego wariantu?

W obecnym setupie dla `Claude Sonnet 4.6` w `eu-central-1` AWS zwraca, ze model wspiera `INFERENCE_PROFILE`.
To oznacza, ze w tej konfiguracji nie wyglada to na prosty przypadek `przelaczenia` na single-region direct model invoke tylko dla Frankfurtu.

Jesli celem ma byc bardziej restrykcyjna regionalizacja AI, trzeba rozwazyc:

- inny model dostepny jako realny single-region invoke,
- innego dostawce modelu w Bedrock,
- lub osobna architekture AI dla klientow wymagajacych `single-region only` albo `local AI`.

---

## 6. Polityka ujawniania stacku

### 6.1. Zasada `minimal disclosure`

AIESS powinno stosowac nastepujaca polityke:

- nie publikowac pelnej listy uslug backendowych i ich wzajemnych zaleznosci,
- nie publikowac nazw wszystkich uslug zarzadzanych, jezeli nie sa potrzebne dla klienta lub regulatora,
- nie publikowac architektury wykonawczej, nazw workflow, wewnetrznych nazw funkcji i warstw integracyjnych,
- publikowac certyfikaty, raporty, regiony, klasy dostawcow i srodki ochrony.

### 6.2. Co ujawniamy chetnie

- panstwo / region przetwarzania,
- fakt korzystania z dostawcow chmurowych i danych w UE,
- DPA, SCC, certyfikacje i raporty,
- kontrola dostepu, szyfrowanie, kopie zapasowe, monitoring, shared responsibility.

### 6.3. Czego nie ujawniamy bez potrzeby

- pelnej listy nazw uslug wykonawczych,
- szczegolowych zaleznosci miedzy komponentami,
- architektury sterowania urzadzeniami,
- sposobu implementacji funkcji AI,
- szczegolow integracji, ktore nie sa wymagane przez prawo lub due diligence.

### 6.4. Zasada redakcyjna do materialow publicznych

W regulaminie, sekcji bezpieczenstwa na stronie i materialach marketingowo-prawnych:

- `piszemy o kategoriach uslug`,
- `piszemy o certyfikatach i umowach`,
- `piszemy o regionach UE`,
- `nie karmimy konkurencji dokumentacja techniczna`.

---

## 7. Rekomendowany pakiet dokumentow AWS

Ponizsza sekcja dotyczy `standardowych regionow AWS w UE`, w szczegolnosci `eu-central-1` i innych regionow europejskich, a nie European Sovereign Cloud.

### 7.1. Dokumenty publiczne i referencyjne

To jest podstawowy pakiet, ktory mozna:

- linkowac publicznie,
- cytowac w regulaminie,
- wykorzystywac na stronie o bezpieczenstwie,
- dolaczac do odpowiedzi dla klientow.


| Dokument                                                                                                             | Po co                                                                         | Jak wykorzystac                                             |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [AWS Customer Agreement](https://aws.amazon.com/agreement/)                                                          | bazowa umowa uslugowa AWS                                                     | odniesienie kontraktowe                                     |
| [AWS Service Terms](https://aws.amazon.com/service-terms/)                                                           | warunki uslug, w tym odniesienia do DPA i addendum                            | podstawa formalna do opisu zasad przetwarzania              |
| [AWS GDPR Data Processing Addendum](https://d1.awsstatic.com/legal/aws-gdpr/AWS_GDPR_DPA.pdf)                        | podstawowa umowa powierzenia / przetwarzania danych                           | kluczowy dokument do pakietu RODO                           |
| [Supplementary Addendum to the AWS GDPR DPA](https://d1.awsstatic.com/Supplementary_Addendum_to_AWS_GDPR_DPA.pdf)    | dodatkowe zobowiazania dotyczace m.in. zadan organow i transferow             | silne wsparcie przy pytaniach o Schrems II i transfery      |
| [UK GDPR Addendum](https://d1.awsstatic.com/legal/aws-gdpr/UK_GDPR_Addendum_to_AWS_data_processing_addendum.pdf)     | przydatne, gdy pojawi sie zakres UK                                           | opcjonalne, nie jako glowny dokument dla UE                 |
| [EU Data Protection](https://aws.amazon.com/compliance/eu-data-protection/)                                          | oficjalne stanowisko AWS dot. danych europejskich, regionow UE i commitmentow | bardzo dobry link publiczny                                 |
| [GDPR Center](https://aws.amazon.com/compliance/gdpr-center/)                                                        | material AWS o zgodnosci z RODO i transferach                                 | dobre zrodlo do sekcji FAQ                                  |
| [Privacy Features of AWS Services](https://aws.amazon.com/compliance/privacy-features/)                              | pokazuje, jak oceniac transfery i funkcje prywatnosci dla konkretnych uslug   | obowiazkowy material do uczciwych twierdzen o danych w UE   |
| [Shared Responsibility Model](https://aws.amazon.com/compliance/shared-responsibility-model/)                        | wyjasnia odpowiedzialnosc AWS vs klient                                       | wazne, by nie nadmiernie przypisywac AWS calosci compliance |
| [AWS Trust Center](https://aws.amazon.com/trust-center/)                                                             | portal zbierajacy compliance, privacy i security                              | dobry link zbiorczy na strone lub do FAQ                    |
| [AWS Artifact](https://aws.amazon.com/artifact/)                                                                     | portal raportow i dokumentow zgodnosci                                        | referencja do materialow prywatnych / audytowych            |
| [Compliance Programs](https://aws.amazon.com/compliance/programs/)                                                   | katalog programow i certyfikacji                                              | przydatne jako indeks                                       |
| [Data Privacy Center](https://aws.amazon.com/compliance/data-privacy/)                                               | publiczne centrum danych i prywatnosci                                        | material wspierajacy                                        |
| [Data Privacy FAQs](https://aws.amazon.com/compliance/data-privacy-faq/)                                             | odpowiedzi na czeste pytania o prywatnosc i dane                              | dobre do cytatow i FAQ                                      |
| [CLOUD Act](https://aws.amazon.com/compliance/cloud-act/)                                                            | material AWS o podejsciu do zadan organow                                     | opcjonalnie do odpowiedzi na pytania prawne                 |
| [Law Enforcement Information Requests](https://www.amazon.com/gp/help/customer/display.html?nodeId=GYSDRGWQ2C2CRYEF) | raport transparentnosci                                                       | opcjonalne wsparcie                                         |


### 7.2. Publiczne raporty i certyfikaty AWS

Te materialy sa bardzo przydatne do sekcji `Bezpieczenstwo`, `Zgodnosc`, `Dlaczego mozna nam zaufac`.


| Material                                                                                                                            | Uwagi                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [AWS SOC 3 Report](https://d1.awsstatic.com/onedam/marketing-channels/website/aws/en_US/whitepapers/compliance/AWS_SOC3_Report.pdf) | publiczny raport potwierdzajacy kontrole bezpieczenstwa na wysokim poziomie |
| [AWS ISO Certified](https://aws.amazon.com/compliance/iso-certified/)                                                               | strona zbiorcza z aktualnymi certyfikatami ISO i zakresem                   |
| [ISO/IEC 27001:2022 Compliance](https://aws.amazon.com/compliance/iso-27001-faqs/)                                                  | publiczne info o ISMS AWS                                                   |
| [ISO/IEC 27701:2019](https://aws.amazon.com/blogs/security/aws-achieves-iso-iec-27701-2019-certification)                           | publiczne potwierdzenie zarzadzania prywatnoscia                            |
| [ISO/IEC 27018:2019 Compliance](https://aws.amazon.com/compliance/iso-27018-faqs/)                                                  | istotne z punktu widzenia ochrony PII w chmurze publicznej                  |
| [BSI C5](https://aws.amazon.com/compliance/bsi-c5/)                                                                                 | szczegolnie wartosciowe dla klientow z DE / DACH                            |
| [CISPE](https://aws.amazon.com/compliance/cispe/)                                                                                   | dodatkowy argument GDPR-oriented dla wybranych use case'ow                  |
| [TISAX](https://aws.amazon.com/compliance/tisax/)                                                                                   | opcjonalne, gdy pojawia sie automotive                                      |
| [HDS](https://aws.amazon.com/compliance/hds/)                                                                                       | opcjonalne, gdy kiedys pojawi sie health / Francja                          |


### 7.3. Dokumenty prywatne / do NDA / due diligence

Tych dokumentow nie nalezy wrzucac publicznie bez sprawdzenia warunkow udostepniania:

- AWS SOC 2 Type II,
- AWS SOC 1 Type II,
- SOC Continued Operations Letter,
- BSI C5 report z AWS Artifact,
- wybrane szczegolowe audyty i agreements z Artifact.

Zasada:

- jesli material pochodzi z `AWS Artifact`, nalezy sprawdzic warunki udostepniania na pierwszej stronie dokumentu,
- nie zakladac, ze wszystko z Artifact mozna swobodnie publikowac dalej.

### 7.4. Minimalny pakiet AWS, ktory warto miec zawsze

Rekomendowany `minimum viable compliance pack` dla AIESS:

1. AWS Customer Agreement
2. AWS Service Terms
3. AWS GDPR DPA
4. Supplementary Addendum
5. EU Data Protection
6. GDPR Center
7. Privacy Features of AWS Services
8. Shared Responsibility Model
9. AWS Trust Center
10. SOC 3
11. ISO 27001 / 27701 / 27018

---

## 8. Dokumenty i materialy dla InfluxDB

### 8.1. Co publicznie potwierdza InfluxDB


| Dokument / strona                                                                                   | Co potwierdza                                                                         | Uzycie                                           |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------ |
| [InfluxDB Cloud regions](https://docs.influxdata.com/influxdb/cloud/reference/regions/)             | dostepnosc regionu `EU Frankfurt` na AWS                                              | potwierdzenie hostingu telemetryki w regionie UE |
| [InfluxDB Cloud security](https://docs.influxdata.com/influxdb/cloud/reference/internals/security/) | TLS, szyfrowanie at rest, VPC isolation, monitoring, incident response, SOC 2 Type II | podstawa opisu security posture                  |
| [InfluxData Security](https://www.influxdata.com/security/)                                         | publiczne informacje o SOC 2 Type 2 i certyfikatach ISO                               | dobry material referencyjny                      |
| [InfluxData Subprocessors](https://www.influxdata.com/legal/influxdata-subprocessors/)              | publiczna lista subprocessorow                                                        | wazne do rejestru podwykonawcow                  |
| [InfluxData Privacy Notice](https://www.influxdata.com/legal/privacy-policy)                        | ogolna polityka prywatnosci                                                           | material wspierajacy, nie zastapi DPA            |


### 8.2. Jak o tym pisac publicznie

Bezpieczne sformulowania:

- `Baza telemetryczna wykorzystywana przez aplikacje jest hostowana w regionie AWS EU Frankfurt.`
- `Dostawca publikuje informacje o szyfrowaniu, kontrolach bezpieczenstwa, certyfikacji SOC 2 Type II oraz subprocessorach.`

Czego nie nalezy obiecywac bez podpisanego dokumentu:

- `InfluxDB gwarantuje, ze zadne przetwarzanie nigdy nie wyjdzie poza UE`,
- `sama lokalizacja regionu oznacza pelna zgodnosc z RODO`.

### 8.3. Co trzymac wewnetrznie

Do `internal evidence pack` warto pozyskac i przechowywac:

- aktualna podpisana DPA / data processing agreement od InfluxData,
- SOC 2 Type II report,
- aktualne potwierdzenie certyfikatow ISO,
- snapshot listy subprocessorow,
- potwierdzenie regionu organizacji / klastra.

---

## 9. Dokumenty i materialy dla Supabase

### 9.1. Co publicznie potwierdza Supabase


| Dokument / strona                                                                                      | Co potwierdza                                                                                     | Uzycie                                       |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| [Available regions](https://supabase.com/docs/guides/platform/regions)                                 | projekt ma jeden primary region; mozna wybrac dokladny AWS region                                 | wazne dla danych uzytkownika                 |
| [SOC 2 Compliance and Supabase](https://supabase.com/docs/guides/security/soc-2-compliance)            | SOC 2 Type 2, shared responsibility, customer-selected region, dane pozostaja w wybranym regionie | kluczowy material publiczny                  |
| [Security at Supabase](https://supabase.com/security)                                                  | AES-256 at rest, TLS in transit, backupy, pentesty, SOC 2 Type 2                                  | dobra baza do sekcji bezpieczenstwa          |
| [Supabase DPA landing page](https://supabase.com/legal/dpa)                                            | istnienie publicznego DPA i sposob uzyskania wersji podpisanej                                    | podstawowy dokument prawny                   |
| [Supabase DPA PDF](https://supabase.com/downloads/docs/Supabase+DPA+250805.pdf)                        | role stron, SCC, region-specific processing clause, subprocessors in Schedule 3                   | bardzo wazny dokument dla compliance         |
| [Shared Responsibility Model](https://supabase.com/docs/guides/deployment/shared-responsibility-model) | odpowiedzialnosc Supabase vs klient                                                               | wazne dla rzetelnego opisu odpowiedzialnosci |


### 9.2. Wazne zapisy z DPA Supabase

Szczegolnie istotne sa nastepujace tezy:

- Supabase dziala jako processor / service provider dla danych klienta,
- DPA obejmuje `Standard Contractual Clauses`,
- gdy klient kieruje przetwarzanie do konkretnego regionu, dane sa `stored and primarily Processed in that region`,
- lista subprocessorow znajduje sie w `Schedule 3`,
- wersja podpisana powinna byc pobrana z dashboardu i trzymana wewnetrznie.

To oznacza, ze publicznie mozna opierac sie na tezie:

- `dane sa hostowane w wybranym regionie`,

ale wewnetrznie lepiej rozumiec zapis bardziej precyzyjnie:

- `stored and primarily processed in the selected region, subject to contractual exceptions and service necessity`.

### 9.3. Jak o tym pisac publicznie

Bezpieczne sformulowania:

- `Dostawca warstwy kont i danych relacyjnych pozwala wybrac region projektu i publikuje DPA, dokumentacje SOC 2 Type 2 oraz materialy security.`
- `Dane uzytkownika sa hostowane w wybranym regionie europejskim zgodnie z konfiguracja projektu i warunkami umownymi dostawcy.`

### 9.4. Co trzymac wewnetrznie

- podpisana wersja DPA z dashboardu,
- SOC 2 report z dashboardu,
- snapshot Schedule 3 / subprocessorow,
- potwierdzenie dokladnego regionu projektu,
- potwierdzenie, czy nie ma read replicas poza wymaganym obszarem.

---

## 10. Rekomendowane sformulowania publiczne

Ponizsze teksty mozna wykorzystac jako baze do regulaminu, polityki prywatnosci, strony `Security`, FAQ albo odpowiedzi dla klienta.

### 10.1. Krotki opis bezpieczenstwa i zgodnosci

`AIESS korzysta z zarzadzanych uslug chmurowych i danych hostowanych w wybranych regionach europejskich. W zakresie przetwarzania danych opieramy sie na dostawcach oferujacych umowy powierzenia przetwarzania danych, standardowe klauzule umowne, publiczne raporty zgodnosci oraz certyfikacje bezpieczenstwa.`

### 10.2. Krotki opis danych w UE

`Dane aplikacji sa przechowywane i przetwarzane przede wszystkim w regionach europejskich, zgodnie z konfiguracja wybranych uslug i warunkami umownymi dostawcow.`

### 10.3. Krotki opis certyfikatow

`Wspolpracujemy z dostawcami, ktorzy publikuja lub udostepniaja dokumentacje zgodnosci i bezpieczenstwa, w tym m.in. raporty SOC oraz certyfikacje ISO dotyczace bezpieczenstwa informacji i ochrony danych.`

### 10.4. Krotki opis podejscia do ujawniania informacji

`W celach bezpieczenstwa i ochrony przewagi konkurencyjnej nie publikujemy pelnej dokumentacji technicznej stacku. Udostepniamy natomiast informacje niezbedne do oceny zgodnosci, bezpieczenstwa, regionow przetwarzania i dokumentow certyfikacyjnych.`

---

## 11. Checklista zalacznikow do pakietu compliance

### 11.1. Materialy, ktore mozna linkowac lub dolaczac publicznie

- AWS Customer Agreement
- AWS Service Terms
- AWS GDPR DPA
- Supplementary Addendum
- AWS EU Data Protection
- AWS GDPR Center
- AWS Privacy Features of AWS Services
- AWS Shared Responsibility Model
- AWS Trust Center
- AWS SOC 3
- AWS ISO 27001 / 27701 / 27018 materials
- InfluxDB regions page
- InfluxDB security page
- InfluxData security page
- InfluxData subprocessor page
- Supabase regions page
- Supabase SOC 2 page
- Supabase security page
- Supabase DPA page
- Supabase public DPA PDF

### 11.2. Materialy tylko do wewnetrznego evidence pack

- podpisane DPA z dostawcami,
- AWS Artifact reports,
- AWS SOC 2 / SOC 1 / C5,
- Supabase SOC 2 report z dashboardu,
- InfluxDB SOC 2 report otrzymany od dostawcy,
- screenshoty lub eksporty potwierdzajace regiony projektow,
- rejestr subprocessorow z data pobrania,
- wewnetrzna lista retencji danych,
- wewnetrzna procedura incydentowa i privacy incident workflow,
- rejestr podstaw prawnych i celow przetwarzania.

### 11.3. Materialy tylko pod NDA / dla klienta enterprise

- szczegolowa mapa stacku,
- dokladne nazwy uslug wykonawczych,
- architektura backendu i warstwy sterowania,
- techniczne przeplywy danych 1:1,
- wyniki szczegolowych audytow i raportow z ograniczona dystrybucja.

---

## 12. Rekomendowana checklista wewnetrzna przed publikacja dokumentow prawnych

Przed publikacja regulaminu, polityki prywatnosci lub strony o bezpieczenstwie nalezy potwierdzic:

1. Dokladny region projektu Supabase w dashboardzie.
2. Czy istnieja read replicas lub inne dodatkowe regiony.
3. Czy podpisana wersja DPA Supabase zostala pobrana i zarchiwizowana.
4. Czy aktualna DPA / contract documentation InfluxDB zostala pozyskana i zarchiwizowana.
5. Czy raporty SOC 2 od Supabase i InfluxDB sa dostepne i przechowywane wewnetrznie.
6. Czy z AWS Artifact zostaly pobrane raporty potrzebne do due diligence.
7. Czy konfiguracja AI nie wykorzystuje niepozadanych transferow, np. cross-region inference, jesli chcecie skladac mocniejsze deklaracje regionalne.
8. Czy w produkcji nie sa aktywne dodatkowe uslugi AWS, ktore zmienialyby obraz transferow danych.
9. Czy okresy retencji dla danych kont, chatu, telemetryki i logow sa opisane biznesowo i prawnie.
10. Czy aktualne polityki prywatnosci dostawcow zostaly przejrzane pod katem subprocessorow i zmian regionalnych.

---

## 13. Wnioski i rekomendacja dla AIESS

### 13.1. Najlepsza narracja compliance na teraz

Dla obecnej aplikacji najrozsadniejsze jest komunikowanie:

- `RODO + dane w UE`,
- `zarzadzane uslugi dostawcow o ugruntowanej dokumentacji compliance`,
- `DPA + SCC + certyfikaty + raporty SOC`,
- `szyfrowanie, kontrola dostepu, monitoring i shared responsibility`.

### 13.2. Czego nie komunikowac jako glownej osi

Na obecnym etapie nie warto budowac glownej narracji na:

- `European Sovereign Cloud`,
- `military-grade sovereign hosting`,
- `w pelni lokalnej / air-gapped architekturze`,
- `pelnej jawnej dokumentacji stacku`.

To moze byc osobna sciezka dla przyszlych wdrozen specjalnych, np. defense, wojsko, on-prem lub lokalne modele open-source.

### 13.3. Osobna sciezka dla przyszlych klientow specjalnych

Jesli pojawi sie wymaganie:

- lokalnego modelu AI,
- izolacji on-prem,
- systemu bez zaleznosci od uslug public cloud,
- architektury dla wojska lub klienta o podwyzszonych wymaganiach,

to nalezy przygotowac `osobny wariant architektury i osobny pakiet compliance`, a nie probowac opisywac tego samym pakietem, ktory sluzy obecnemu modelowi SaaS / cloud.

---

## 14. Notatki wewnetrzne do dalszego dopracowania

### 14.1. Istotna obserwacja implementacyjna

Obecna implementacja wskazuje, ze sesja Supabase jest obecnie utrwalana przez mechanizm oparty o `localStorage` po zainstalowaniu adaptera z `expo-sqlite/localStorage/install`, a nie przez `SecureStore`.

To nie jest temat do komunikacji publicznej, ale warto go ocenic wewnetrznie jako temat hardeningu bezpieczenstwa aplikacji.

### 14.2. Dodatkowe tematy do osobnego dokumentu

Warto osobno przygotowac:

- `retention policy`,
- `subprocessor register`,
- `incident response / breach handling`,
- `public-facing security page copy`,
- `privacy policy input matrix`,
- `enterprise due diligence pack`.

---

## 15. Krotka wersja dla zarzadu / sprzedazy

Jesli trzeba to streścić do 3 zdan:

- `AIESS korzysta z dobranych uslug chmurowych hostowanych w regionach europejskich i opiera przetwarzanie na publicznie dostepnej dokumentacji compliance oraz umowach DPA/SCC dostawcow.`
- `Publicznie komunikujemy certyfikaty, regiony przetwarzania i srodki ochrony, ale nie publikujemy pelnej mapy stacku technologicznego.`
- `Dla klientow o wymaganiach specjalnych, np. defense lub local AI, przygotujemy osobny wariant architektury i osobny pakiet zgodnosci.`

