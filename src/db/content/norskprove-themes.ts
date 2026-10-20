/**
 * Curated Norskprøven muntlig content: common exam themes, each with several
 * question sets (Del 1 monologue, Del 2 discussion, Del 3 follow-up pool) per level.
 *
 * Seeded by `npm run db:seed:norskprove` (src/db/seed-norskprove.ts).
 * Slugs are stable identifiers — do not rename them once seeded in production.
 * Theme slugs `familie-og-barn`, `miljo-og-natur`, `transport-og-bosted`,
 * `skole-og-digitalisering` and `arbeid-og-teknologi` are shared with src/db/seed.ts.
 */

export interface NorskproveQuestionSet {
  slug: string;
  titleNo: string;
  level: 'B1' | 'B2';
  monologuePromptNo: string;
  discussionPromptNo: string;
  followUpQuestionsNo: string[];
}

export interface NorskproveTheme {
  slug: string;
  titleNo: string;
  descriptionNo: string;
  sortOrder: number;
  sets: NorskproveQuestionSet[];
}

export const NORSKPROVE_THEMES: NorskproveTheme[] = [
  {
    slug: 'familie-og-barn',
    titleNo: 'Familie og barn',
    descriptionNo: 'Familieliv, oppvekst, barneoppdragelse og generasjoner.',
    sortOrder: 0,
    sets: [
      {
        slug: 'familien-min',
        titleNo: 'Familien min',
        level: 'B1',
        monologuePromptNo:
          'Fortell om familien din. Hvem består familien av, og hva liker dere å gjøre sammen?',
        discussionPromptNo:
          'Diskuter om det er best for barn å vokse opp i en stor eller en liten familie.',
        followUpQuestionsNo: [
          'Hvem i familien din står du nærmest, og hvorfor?',
          'Hvordan feirer dere bursdager i familien din?',
          'Hvor ofte har du kontakt med familie som bor langt unna?',
          'Hva har du lært av foreldrene dine som du vil lære videre til andre?',
        ],
      },
      {
        slug: 'barndom-og-oppvekst',
        titleNo: 'Barndom og oppvekst',
        level: 'B1',
        monologuePromptNo:
          'Fortell om barndommen din. Hvor vokste du opp, og hva gjorde du på fritiden da du var barn?',
        discussionPromptNo:
          'Diskuter om barn i dag har en bedre eller dårligere barndom enn barn hadde for 30 år siden.',
        followUpQuestionsNo: [
          'Hva var din beste opplevelse som barn?',
          'Bør barn få mobiltelefon før de begynner på skolen?',
          'Hvor mye bør barn hjelpe til hjemme?',
          'Hvordan er det å være barn i Norge sammenlignet med i landet du kommer fra?',
        ],
      },
      {
        slug: 'likestilling-i-familien',
        titleNo: 'Likestilling i familien',
        level: 'B2',
        monologuePromptNo:
          'Gjør rede for hvordan arbeidsfordelingen mellom kvinner og menn i familien har endret seg, og hva du mener er årsakene til det.',
        discussionPromptNo:
          'Diskuter om foreldrepermisjonen bør deles helt likt mellom mor og far, eller om familiene selv bør få bestemme.',
        followUpQuestionsNo: [
          'Hvilke fordeler og ulemper har det at begge foreldrene jobber fullt?',
          'I hvilken grad bør staten påvirke hvordan familier organiserer hverdagen sin?',
          'Hvordan kan arbeidsgivere gjøre det lettere å kombinere jobb og familie?',
          'Tror du likestilling i hjemmet påvirker barnas syn på kjønnsroller?',
        ],
      },
      {
        slug: 'generasjoner-og-eldreomsorg',
        titleNo: 'Generasjoner og eldreomsorg',
        level: 'B2',
        monologuePromptNo:
          'Drøft hvilket ansvar voksne barn bør ha for foreldrene sine når de blir gamle.',
        discussionPromptNo:
          'Diskuter om eldreomsorgen først og fremst bør være samfunnets ansvar eller familiens ansvar.',
        followUpQuestionsNo: [
          'Hvordan kan samfunnet bruke kunnskapen og erfaringen til eldre mennesker bedre?',
          'Hva kan gjøres for å hindre ensomhet blant eldre?',
          'Hvilke utfordringer gir en aldrende befolkning for velferdsstaten?',
          'Er det en god idé at flere generasjoner bor sammen?',
        ],
      },
    ],
  },
  {
    slug: 'bolig-og-nabolag',
    titleNo: 'Bolig og nabolag',
    descriptionNo: 'Hjemmet, boformer, naboer og lokalmiljø.',
    sortOrder: 1,
    sets: [
      {
        slug: 'hjemmet-mitt',
        titleNo: 'Hjemmet mitt',
        level: 'B1',
        monologuePromptNo:
          'Beskriv boligen du bor i nå. Hva liker du med den, og hva ville du forandret?',
        discussionPromptNo: 'Diskuter om det er bedre å eie eller å leie bolig.',
        followUpQuestionsNo: [
          'Hvordan ser drømmeboligen din ut?',
          'Hvor viktig er det for deg å bo nær jobb eller skole?',
          'Hva er det beste med nabolaget ditt?',
          'Har du flyttet mange ganger? Fortell om en flytting.',
        ],
      },
      {
        slug: 'naboer-og-dugnad',
        titleNo: 'Naboer og dugnad',
        level: 'B1',
        monologuePromptNo: 'Fortell om naboene dine. Hvordan er kontakten mellom dere?',
        discussionPromptNo:
          'Diskuter om alle beboere bør ha plikt til å delta på dugnad i borettslaget eller nabolaget.',
        followUpQuestionsNo: [
          'Har du vært med på dugnad? Hvordan var det?',
          'Hva gjør du hvis en nabo bråker om natten?',
          'Hvordan kan man bli kjent med nye naboer?',
          'Er det vanlig å hjelpe naboene sine i landet du kommer fra?',
        ],
      },
      {
        slug: 'boligmarkedet-og-unge-voksne',
        titleNo: 'Boligmarkedet og unge voksne',
        level: 'B2',
        monologuePromptNo:
          'Gjør rede for hvorfor det har blitt vanskelig for mange unge å kjøpe sin første bolig, og hvilke konsekvenser dette kan få.',
        discussionPromptNo:
          'Diskuter om myndighetene bør gripe mer inn i boligmarkedet, for eksempel gjennom flere kommunale utleieboliger eller strengere regler for utleie.',
        followUpQuestionsNo: [
          'Bør foreldre hjelpe barna sine økonomisk med å kjøpe bolig?',
          'Hvilke fordeler og ulemper har korttidsutleie gjennom digitale plattformer for lokalsamfunnet?',
          'Hvordan påvirker høye boligpriser hvem som har råd til å bo i sentrum av byene?',
          'Er det realistisk at alle skal kunne eie sin egen bolig?',
        ],
      },
      {
        slug: 'boformer-i-endring',
        titleNo: 'Boformer i endring',
        level: 'B2',
        monologuePromptNo:
          'Drøft hvorfor stadig flere bor alene i Norge, og hvilke konsekvenser det kan ha for den enkelte og for samfunnet.',
        discussionPromptNo:
          'Diskuter om kollektive boformer, der flere deler kjøkken og fellesarealer, kan være en god løsning for framtiden.',
        followUpQuestionsNo: [
          'Hva kan være utfordrende ved å dele bolig med personer man ikke kjenner fra før?',
          'Hvordan kan boligområder planlegges slik at folk får mer kontakt med hverandre?',
          'Bør eldre få bedre tilbud om å bo i fellesskap med andre?',
          'Hvilken betydning har et godt nabolag for livskvaliteten?',
        ],
      },
    ],
  },
  {
    slug: 'transport-og-bosted',
    titleNo: 'Transport og bosted',
    descriptionNo: 'Kollektivtransport, byliv, distrikt og boforhold.',
    sortOrder: 2,
    sets: [
      {
        slug: 'reisen-til-jobb-og-skole',
        titleNo: 'Reisen til jobb og skole',
        level: 'B1',
        monologuePromptNo:
          'Fortell hvordan du vanligvis reiser til jobb, skole eller butikken. Hvor lang tid bruker du?',
        discussionPromptNo: 'Diskuter om det bør være forbudt å kjøre bil i sentrum av byene.',
        followUpQuestionsNo: [
          'Hva synes du om kollektivtilbudet der du bor?',
          'Sykler du? Hvorfor, eller hvorfor ikke?',
          'Hva gjør du når du sitter på bussen eller toget?',
          'Hvordan var transporten i byen der du vokste opp?',
        ],
      },
      {
        slug: 'stedet-der-jeg-bor',
        titleNo: 'Stedet der jeg bor',
        level: 'B1',
        monologuePromptNo:
          'Fortell om stedet du bor. Er det en by eller et lite sted, og hva liker du med det?',
        discussionPromptNo:
          'Diskuter om det er bedre for familier å bo i byen eller på landet.',
        followUpQuestionsNo: [
          'Hva savner du på stedet du bor nå?',
          'Hvilke tilbud er viktige for deg i nærmiljøet?',
          'Kunne du tenke deg å bo på en øy eller i fjellet?',
          'Hvordan har stedet du bor forandret seg siden du kom dit?',
        ],
      },
      {
        slug: 'livet-i-by-og-bygd',
        titleNo: 'Livet i by og bygd',
        level: 'B2',
        monologuePromptNo:
          'Drøft fordeler og ulemper ved å bo i en storby sammenlignet med å bo på et lite sted på landet.',
        discussionPromptNo:
          'Diskuter om staten bør bruke mer penger på å få folk til å bosette seg i distriktene.',
        followUpQuestionsNo: [
          'Hvordan kan små kommuner gjøre seg mer attraktive for unge familier?',
          'Hva betyr sentralisering for tilbudet av skoler og sykehus?',
          'Har hjemmekontor gjort det lettere å bo utenfor byene?',
          'Hvilket ansvar har storbyene for å ta imot flere innbyggere?',
        ],
      },
      {
        slug: 'elbiler-veier-og-jernbane',
        titleNo: 'Elbiler, veier og jernbane',
        level: 'B2',
        monologuePromptNo:
          'Gjør rede for hvorfor Norge har så mange elbiler, og drøft om satsingen har vært en god bruk av fellesskapets penger.',
        discussionPromptNo:
          'Diskuter om staten bør prioritere å bygge nye veier eller å satse på jernbane og kollektivtransport.',
        followUpQuestionsNo: [
          'Er det rettferdig at elbilister har fått fordeler som andre bilister ikke har?',
          'Hvordan kan transport i distriktene bli mer miljøvennlig?',
          'Bør flyreiser innenlands bli dyrere av hensyn til klimaet?',
          'Hvilken rolle tror du selvkjørende biler vil spille i framtiden?',
        ],
      },
    ],
  },
  {
    slug: 'arbeid-og-teknologi',
    titleNo: 'Arbeid og teknologi',
    descriptionNo: 'Arbeidsliv, kunstig intelligens og fremtidens jobber.',
    sortOrder: 3,
    sets: [
      {
        slug: 'jobben-min',
        titleNo: 'Jobben min',
        level: 'B1',
        monologuePromptNo:
          'Fortell om jobben din eller en jobb du har hatt. Hva gjør du i løpet av en vanlig arbeidsdag?',
        discussionPromptNo:
          'Diskuter hva som er viktigst i en jobb: høy lønn, hyggelige kolleger eller spennende arbeidsoppgaver.',
        followUpQuestionsNo: [
          'Hva er drømmejobben din?',
          'Hvordan fikk du din første jobb?',
          'Hva gjør du for å slappe av etter jobb?',
          'Hvordan er arbeidslivet i Norge forskjellig fra i landet du kommer fra?',
        ],
      },
      {
        slug: 'a-soke-jobb',
        titleNo: 'Å søke jobb',
        level: 'B1',
        monologuePromptNo:
          'Fortell om hvordan man kan finne og søke jobb i Norge. Hva har du selv erfaring med?',
        discussionPromptNo:
          'Diskuter om det er viktigere å ha god utdanning eller lang arbeidserfaring når man søker jobb.',
        followUpQuestionsNo: [
          'Hvordan forbereder du deg til et jobbintervju?',
          'Hvor viktig er det å snakke godt norsk for å få jobb?',
          'Hva bør man skrive i en jobbsøknad?',
          'Kjenner du noen som har fått jobb gjennom venner eller familie?',
        ],
      },
      {
        slug: 'hjemmekontor-og-fleksibilitet',
        titleNo: 'Hjemmekontor og fleksibilitet',
        level: 'B2',
        monologuePromptNo:
          'Drøft hvordan hjemmekontor og fleksibel arbeidstid har endret arbeidslivet de siste årene.',
        discussionPromptNo:
          'Diskuter om arbeidsgivere bør kunne kreve at de ansatte er på kontoret hver dag.',
        followUpQuestionsNo: [
          'Hvordan påvirker hjemmekontor samarbeidet og fellesskapet på en arbeidsplass?',
          'Bør arbeidsuken bli kortere i framtiden?',
          'Hvordan kan man unngå at jobb og fritid flyter sammen?',
          'Hvilke yrker egner seg ikke for hjemmekontor, og hva betyr det for likheten mellom arbeidstakere?',
        ],
      },
      {
        slug: 'automatisering-og-kompetanse',
        titleNo: 'Automatisering og kompetanse',
        level: 'B2',
        monologuePromptNo:
          'Gjør rede for hvordan automatisering og ny teknologi kan endre hvilke yrker vi trenger i framtiden.',
        discussionPromptNo:
          'Diskuter om det er arbeidstakernes eget ansvar å holde kompetansen sin oppdatert, eller om arbeidsgiver og staten bør ta ansvaret.',
        followUpQuestionsNo: [
          'Hvilke yrker tror du vil forsvinne de neste tjue årene?',
          'Hvordan kan eldre arbeidstakere få hjelp til å lære ny teknologi?',
          'Bør det være gratis å ta videreutdanning gjennom hele livet?',
          'Hvilke menneskelige egenskaper kan ikke erstattes av maskiner?',
        ],
      },
    ],
  },
  {
    slug: 'skole-og-digitalisering',
    titleNo: 'Skole og digitalisering',
    descriptionNo: 'Utdanning, skjermbruk og digitale verktøy.',
    sortOrder: 4,
    sets: [
      {
        slug: 'skoletiden-min',
        titleNo: 'Skoletiden min',
        level: 'B1',
        monologuePromptNo:
          'Fortell om skolen du gikk på. Hvilke fag likte du, og hvordan var lærerne?',
        discussionPromptNo: 'Diskuter om elever bør ha skoleuniform.',
        followUpQuestionsNo: [
          'Hva var det vanskeligste faget for deg?',
          'Hvordan er skolen i Norge forskjellig fra skolen i landet du kommer fra?',
          'Bør elever få lekser hver dag?',
          'Hva vil du gjerne lære mer om i framtiden?',
        ],
      },
      {
        slug: 'a-laere-pa-nett',
        titleNo: 'Å lære på nett',
        level: 'B1',
        monologuePromptNo:
          'Fortell om en gang du lærte noe nytt ved hjelp av internett, apper eller videoer.',
        discussionPromptNo:
          'Diskuter om det er bedre å lære i et klasserom med en lærer eller å lære på nettet hjemme.',
        followUpQuestionsNo: [
          'Hvilke apper eller nettsider bruker du for å lære?',
          'Hvor mange timer bruker du foran en skjerm hver dag?',
          'Bør barn lære å programmere på skolen?',
          'Hva er fordelene med å lese bøker på papir?',
        ],
      },
      {
        slug: 'hoyere-utdanning-og-samfunnet',
        titleNo: 'Høyere utdanning og samfunnet',
        level: 'B2',
        monologuePromptNo:
          'Drøft hvilken betydning høyere utdanning har for den enkeltes muligheter og for samfunnet som helhet.',
        discussionPromptNo:
          'Diskuter om det bør være gratis å studere ved universiteter og høyskoler, også for studenter fra land utenfor Europa.',
        followUpQuestionsNo: [
          'Er det for mange som tar høyere utdanning, og for få som velger yrkesfag?',
          'Hvordan kan skolen bli bedre til å forberede elever på arbeidslivet?',
          'Hvilket ansvar har skolen for å utjevne sosiale forskjeller?',
          'Bør karakterer erstattes av andre former for vurdering?',
        ],
      },
      {
        slug: 'kunstig-intelligens-i-skolen',
        titleNo: 'Kunstig intelligens i skolen',
        level: 'B2',
        monologuePromptNo:
          'Gjør rede for hvordan kunstig intelligens kan påvirke måten elever og studenter lærer på.',
        discussionPromptNo:
          'Diskuter om elever bør få bruke KI-verktøy når de skriver oppgaver og tar prøver.',
        followUpQuestionsNo: [
          'Hvordan kan lærere avgjøre om en tekst er skrevet av eleven selv?',
          'Hvilke ferdigheter blir viktigere når datamaskiner kan svare på det meste?',
          'Kan digitale verktøy gjøre undervisningen mer rettferdig for elever med lærevansker?',
          'Hva mister vi hvis elevene skriver mindre for hånd?',
        ],
      },
    ],
  },
  {
    slug: 'helse-og-livsstil',
    titleNo: 'Helse og livsstil',
    descriptionNo: 'Trening, søvn, stress og helsevesenet.',
    sortOrder: 5,
    sets: [
      {
        slug: 'en-sunn-hverdag',
        titleNo: 'En sunn hverdag',
        level: 'B1',
        monologuePromptNo: 'Fortell hva du gjør for å holde deg frisk og i god form.',
        discussionPromptNo:
          'Diskuter om det er viktigere å trene regelmessig eller å spise sunt.',
        followUpQuestionsNo: [
          'Hvilken type trening liker du best?',
          'Hvor mange timer sover du vanligvis?',
          'Hva gjør du når du føler deg stresset?',
          'Hvordan holder du deg aktiv om vinteren?',
        ],
      },
      {
        slug: 'hos-legen',
        titleNo: 'Hos legen',
        level: 'B1',
        monologuePromptNo:
          'Fortell om en gang du eller noen du kjenner var syk. Hva skjedde, og hvem hjalp dere?',
        discussionPromptNo: 'Diskuter om det bør koste penger å gå til legen.',
        followUpQuestionsNo: [
          'Hva gjør du når du blir forkjølet?',
          'Hvordan er helsetjenestene i Norge sammenlignet med i landet du kommer fra?',
          'Hvordan var det første gang du var hos fastlegen i Norge?',
          'Hva synes du om å bestille legetime på nett?',
        ],
      },
      {
        slug: 'psykisk-helse-blant-unge',
        titleNo: 'Psykisk helse blant unge',
        level: 'B2',
        monologuePromptNo:
          'Drøft hvorfor flere unge rapporterer om psykiske plager, og hva som kan være årsakene.',
        discussionPromptNo:
          'Diskuter om skolen bør ha et større ansvar for elevenes psykiske helse.',
        followUpQuestionsNo: [
          'Hvordan kan vi gjøre det lettere å snakke åpent om psykisk helse?',
          'Hvilken rolle spiller sosiale medier for selvbildet til unge?',
          'Bør arbeidsgivere tilby hjelp mot stress og utbrenthet?',
          'Er det et samfunnsansvar å forebygge ensomhet?',
        ],
      },
      {
        slug: 'folkehelse-og-personlig-ansvar',
        titleNo: 'Folkehelse og personlig ansvar',
        level: 'B2',
        monologuePromptNo:
          'Gjør rede for hvilke tiltak myndighetene kan bruke for å bedre folkehelsen, og drøft hvor langt de bør gå.',
        discussionPromptNo:
          'Diskuter om det er riktig å ha høye avgifter på sukker, alkohol og tobakk for å få folk til å leve sunnere.',
        followUpQuestionsNo: [
          'Hvor går grensen mellom statens ansvar og den enkeltes frihet?',
          'Bør behandling av livsstilssykdommer prioriteres lavere i helsevesenet?',
          'Hvordan kan arbeidsplasser legge til rette for en sunnere livsstil?',
          'Hvilke helseutfordringer tror du blir størst i framtiden?',
        ],
      },
    ],
  },
  {
    slug: 'mat-og-matkultur',
    titleNo: 'Mat og matkultur',
    descriptionNo: 'Matvaner, måltider, matlaging og tradisjonsmat.',
    sortOrder: 6,
    sets: [
      {
        slug: 'matvanene-mine',
        titleNo: 'Matvanene mine',
        level: 'B1',
        monologuePromptNo:
          'Fortell om hva du vanligvis spiser i løpet av en dag. Hva er favorittmaten din?',
        discussionPromptNo:
          'Diskuter om det er bedre å lage mat hjemme eller å kjøpe ferdigmat og spise ute.',
        followUpQuestionsNo: [
          'Hvilken norsk mat har du smakt, og hva synes du om den?',
          'Hvem lager middag hjemme hos dere?',
          'Hva spiser man til frokost i landet du kommer fra?',
          'Hva ville du servert hvis du hadde gjester til middag?',
        ],
      },
      {
        slug: 'matlaging-og-mattradisjoner',
        titleNo: 'Matlaging og mattradisjoner',
        level: 'B1',
        monologuePromptNo:
          'Fortell om en rett fra hjemlandet ditt eller familien din. Hvordan lager man den, og når spiser dere den?',
        discussionPromptNo: 'Diskuter om barn bør lære matlaging på skolen.',
        followUpQuestionsNo: [
          'Hvem lærte deg å lage mat?',
          'Hva spiser dere på høytider og bursdager?',
          'Er det vanskelig å få tak i ingredienser fra hjemlandet ditt i Norge?',
          'Hva synes du om matpakke til lunsj?',
        ],
      },
      {
        slug: 'matsvinn',
        titleNo: 'Matsvinn',
        level: 'B2',
        monologuePromptNo:
          'Gjør rede for hvorfor det kastes så mye mat i rike land, og drøft hva som kan gjøres for å redusere matsvinnet.',
        discussionPromptNo:
          'Diskuter om butikker bør bli pålagt å gi bort mat som nærmer seg siste forbruksdag.',
        followUpQuestionsNo: [
          'Hvilket ansvar har forbrukerne sammenlignet med matbransjen?',
          'Bør vi spise mindre kjøtt av hensyn til klima og miljø?',
          'Hvordan påvirker matprisene hva folk velger å spise?',
          'Er det viktig at Norge produserer mest mulig av sin egen mat?',
        ],
      },
      {
        slug: 'matkultur-og-globalisering',
        titleNo: 'Matkultur og globalisering',
        level: 'B2',
        monologuePromptNo:
          'Drøft hvordan globalisering og innvandring har påvirket norsk matkultur.',
        discussionPromptNo:
          'Diskuter om det er viktig å bevare tradisjonell norsk mat, eller om matkulturen naturlig bør endre seg med tiden.',
        followUpQuestionsNo: [
          'Hvilken rolle spiller mat når man skal bli kjent med en ny kultur?',
          'Hvordan har sosiale medier påvirket matvanene våre?',
          'Bør skolene tilby gratis lunsj til alle elever?',
          'Hva sier matvanene våre om samfunnet vi lever i?',
        ],
      },
    ],
  },
  {
    slug: 'miljo-og-natur',
    titleNo: 'Miljø og natur',
    descriptionNo: 'Klima, bærekraft, gjenbruk og friluftsliv.',
    sortOrder: 7,
    sets: [
      {
        slug: 'natur-og-friluftsliv',
        titleNo: 'Natur og friluftsliv',
        level: 'B1',
        monologuePromptNo:
          'Fortell om en tur i naturen som du husker godt. Hvor var du, og hva gjorde du?',
        discussionPromptNo:
          'Diskuter om det er viktig at alle barn lærer å gå på ski og være ute i naturen.',
        followUpQuestionsNo: [
          'Hva er din favorittårstid i Norge, og hvorfor?',
          'Hvordan påvirker været humøret ditt?',
          'Har du prøvd å overnatte i telt eller på hytte?',
          'Hvordan bruker folk naturen i landet du kommer fra?',
        ],
      },
      {
        slug: 'gjenbruk-og-kildesortering',
        titleNo: 'Gjenbruk og kildesortering',
        level: 'B1',
        monologuePromptNo: 'Fortell hva du gjør for å sortere søppel og bruke ting om igjen.',
        discussionPromptNo:
          'Diskuter om det bør bli dyrere å kjøpe nye klær, slik at folk handler mer brukt.',
        followUpQuestionsNo: [
          'Har du kjøpt noe brukt? Hva var det?',
          'Hvordan sorterer dere avfallet hjemme?',
          'Hva kan man gjøre med klær man ikke bruker lenger?',
          'Er det lett eller vanskelig å leve miljøvennlig?',
        ],
      },
      {
        slug: 'klimaendringer-og-ansvar',
        titleNo: 'Klimaendringer og ansvar',
        level: 'B2',
        monologuePromptNo:
          'Drøft hvem som har størst ansvar for å løse klimaproblemene: enkeltpersoner, næringslivet eller myndighetene.',
        discussionPromptNo: 'Diskuter om Norge bør slutte å lete etter ny olje og gass.',
        followUpQuestionsNo: [
          'Er det rettferdig at rike land må kutte mer i utslippene enn fattige land?',
          'Hvordan kan klimapolitikken få bred støtte i befolkningen?',
          'Har det noen hensikt at én person endrer vaner når utslippene er globale?',
          'Hvilke konsekvenser av klimaendringene ser vi allerede i Norge?',
        ],
      },
      {
        slug: 'naturvern-og-fornybar-energi',
        titleNo: 'Naturvern og fornybar energi',
        level: 'B2',
        monologuePromptNo:
          'Gjør rede for konflikten mellom naturvern og behovet for ny energi, for eksempel vindkraft.',
        discussionPromptNo:
          'Diskuter om det er riktig å bygge vindkraftverk i urørt natur for å produsere mer fornybar energi.',
        followUpQuestionsNo: [
          'Hvordan bør lokalbefolkningens meninger veies mot nasjonale interesser?',
          'Hvilken verdi har urørt natur for samfunnet?',
          'Kan vi løse energibehovet ved å bruke mindre strøm i stedet for å bygge mer?',
          'Hvordan påvirker naturinngrep dyrelivet og det biologiske mangfoldet?',
        ],
      },
    ],
  },
  {
    slug: 'fritid-og-hobbyer',
    titleNo: 'Fritid og hobbyer',
    descriptionNo: 'Fritidsaktiviteter, idrett, frivillighet og venner.',
    sortOrder: 8,
    sets: [
      {
        slug: 'fritiden-min',
        titleNo: 'Fritiden min',
        level: 'B1',
        monologuePromptNo:
          'Fortell hva du liker å gjøre på fritiden. Hvor ofte gjør du det, og hvem gjør du det sammen med?',
        discussionPromptNo:
          'Diskuter om det er bedre å bruke fritiden hjemme eller å gå ut og gjøre aktiviteter med andre.',
        followUpQuestionsNo: [
          'Hvilken hobby kunne du tenke deg å begynne med?',
          'Hva gjorde du forrige helg?',
          'Hvordan blir du kjent med nye mennesker i Norge?',
          'Liker du best å være aktiv eller å slappe av på fritiden?',
        ],
      },
      {
        slug: 'idrett-og-trening',
        titleNo: 'Idrett og trening',
        level: 'B1',
        monologuePromptNo:
          'Fortell om en idrett du liker å drive med eller se på.',
        discussionPromptNo:
          'Diskuter om barn bør drive med organisert idrett, eller om det er bedre at de leker fritt.',
        followUpQuestionsNo: [
          'Har du vært med i en idrettsklubb?',
          'Hvilke idretter er populære i landet du kommer fra?',
          'Hva synes du om at nordmenn er så opptatt av ski?',
          'Bør det være gratis å trene på treningssenter?',
        ],
      },
      {
        slug: 'frivillighet-i-samfunnet',
        titleNo: 'Frivillighet i samfunnet',
        level: 'B2',
        monologuePromptNo:
          'Drøft hvilken betydning frivillig arbeid har for det norske samfunnet.',
        discussionPromptNo:
          'Diskuter om frivillige organisasjoner bør få mer økonomisk støtte fra staten, eller om det svekker frivilligheten.',
        followUpQuestionsNo: [
          'Hvorfor tror du færre unge engasjerer seg i frivillige organisasjoner enn før?',
          'Kan frivillighet være en vei inn i arbeidslivet for nyankomne?',
          'Er det riktig at foreldre forventes å bruke mye tid på dugnad for barnas aktiviteter?',
          'Hvordan kan frivilligheten nå ut til flere grupper i samfunnet?',
        ],
      },
      {
        slug: 'fritidsaktiviteter-og-okonomi',
        titleNo: 'Fritidsaktiviteter og økonomi',
        level: 'B2',
        monologuePromptNo:
          'Gjør rede for hvordan familiens økonomi kan påvirke barns og unges muligheter til å delta i fritidsaktiviteter.',
        discussionPromptNo:
          'Diskuter om alle barn bør få et gratis fritidstilbud betalt av kommunen.',
        followUpQuestionsNo: [
          'Hvilke følger kan det få for et barn å stå utenfor fritidsaktiviteter?',
          'Har toppidretten blitt for viktig i barneidretten?',
          'Hvordan kan bibliotek og fritidsklubber bidra til inkludering?',
          'Bør det offentlige bruke penger på store idrettsarrangementer?',
        ],
      },
    ],
  },
  {
    slug: 'kultur-og-tradisjoner',
    titleNo: 'Kultur og tradisjoner',
    descriptionNo: 'Høytider, feiring, skikker og kulturliv.',
    sortOrder: 9,
    sets: [
      {
        slug: 'hoytider-og-feiring',
        titleNo: 'Høytider og feiring',
        level: 'B1',
        monologuePromptNo:
          'Fortell om en høytid eller fest som er viktig for deg. Hvordan feirer du den?',
        discussionPromptNo:
          'Diskuter om det er viktig å holde på tradisjoner fra hjemlandet når man bor i et nytt land.',
        followUpQuestionsNo: [
          'Hvordan feiret du 17. mai første gang du var i Norge?',
          'Hvilken norsk tradisjon liker du best?',
          'Gir dere gaver til hverandre i familien din? Når?',
          'Hvilken norsk skikk overrasket deg da du kom hit?',
        ],
      },
      {
        slug: 'kulturopplevelser',
        titleNo: 'Kulturopplevelser',
        level: 'B1',
        monologuePromptNo:
          'Fortell om en konsert, film, bok eller utstilling som du har likt godt.',
        discussionPromptNo: 'Diskuter om det er bedre å se film på kino eller hjemme.',
        followUpQuestionsNo: [
          'Hvilken musikk hører du på?',
          'Hvor ofte går du på biblioteket?',
          'Kjenner du noen norske forfattere, artister eller filmer?',
          'Hva gjør du når du vil oppleve noe nytt i byen der du bor?',
        ],
      },
      {
        slug: 'det-flerkulturelle-samfunnet',
        titleNo: 'Det flerkulturelle samfunnet',
        level: 'B2',
        monologuePromptNo:
          'Drøft hvordan et flerkulturelt samfunn kan berike og utfordre felles verdier og tradisjoner.',
        discussionPromptNo:
          'Diskuter om skolen bør markere høytider fra flere religioner og kulturer, eller holde seg til de tradisjonelle norske.',
        followUpQuestionsNo: [
          'Hva menes med «norske verdier», og hvem bestemmer hva de er?',
          'Hvordan kan tradisjoner endre seg uten at de mister betydningen sin?',
          'Hvilken rolle spiller religion i det norske samfunnet i dag?',
          'Kan felles tradisjoner bidra til tillit mellom mennesker?',
        ],
      },
      {
        slug: 'kunst-og-kulturstotte',
        titleNo: 'Kunst og kulturstøtte',
        level: 'B2',
        monologuePromptNo:
          'Gjør rede for argumenter for og mot at staten gir økonomisk støtte til kunst og kultur.',
        discussionPromptNo:
          'Diskuter om offentlige penger heller bør gå til folkelige kulturtilbud enn til opera, teater og kunstmuseer.',
        followUpQuestionsNo: [
          'Hvordan påvirker strømmetjenester musikere og filmskapere?',
          'Bør kulturtilbud være gratis for barn og unge?',
          'Hvilken betydning har kultur for lokalsamfunn i distriktene?',
          'Hvordan kan man ta vare på minoritetsspråk og minoritetskulturer?',
        ],
      },
    ],
  },
  {
    slug: 'a-bo-i-norge',
    titleNo: 'Å bo i Norge',
    descriptionNo: 'Integrering, språklæring, møte med norsk kultur og samfunn.',
    sortOrder: 10,
    sets: [
      {
        slug: 'den-forste-tiden-i-norge',
        titleNo: 'Den første tiden i Norge',
        level: 'B1',
        monologuePromptNo:
          'Fortell om den første tiden din i Norge. Hva var nytt eller overraskende for deg?',
        discussionPromptNo:
          'Diskuter hva som er viktigst for å trives i et nytt land: jobb, språk eller venner.',
        followUpQuestionsNo: [
          'Hva savner du mest fra hjemlandet ditt?',
          'Hva var det vanskeligste med å flytte til Norge?',
          'Hvilke råd ville du gitt til en person som nettopp har kommet hit?',
          'Hva liker du best med Norge?',
        ],
      },
      {
        slug: 'a-laere-norsk',
        titleNo: 'Å lære norsk',
        level: 'B1',
        monologuePromptNo: 'Fortell hvordan du lærer norsk. Hva gjør du for å bli bedre?',
        discussionPromptNo:
          'Diskuter om det er bedre å lære norsk på kurs eller gjennom jobb og hverdagsliv.',
        followUpQuestionsNo: [
          'Hvilke norske ord eller uttrykk liker du?',
          'Hva synes du er vanskeligst med norsk?',
          'Hvordan øver du på å snakke norsk utenfor klasserommet?',
          'Snakker du norsk med naboer eller kolleger?',
        ],
      },
      {
        slug: 'integrering-og-ansvar',
        titleNo: 'Integrering og ansvar',
        level: 'B2',
        monologuePromptNo:
          'Drøft hva god integrering betyr, og hvilket ansvar både innvandrere og samfunnet har.',
        discussionPromptNo:
          'Diskuter om det bør stilles strengere krav til norskkunnskaper for å få permanent oppholdstillatelse og statsborgerskap.',
        followUpQuestionsNo: [
          'Hvorfor får mange innvandrere med høy utdanning ikke jobb i sitt eget fag?',
          'Hvordan kan arbeidsplasser bli mer inkluderende?',
          'Hvilken rolle spiller frivillige organisasjoner i integreringen?',
          'Kan man ha flere nasjonale identiteter samtidig?',
        ],
      },
      {
        slug: 'tillit-og-velferdsstaten',
        titleNo: 'Tillit og velferdsstaten',
        level: 'B2',
        monologuePromptNo:
          'Gjør rede for hvorfor Norge ofte beskrives som et samfunn med høy tillit, og drøft hva som kan svekke denne tilliten.',
        discussionPromptNo:
          'Diskuter om høye skatter er en rimelig pris å betale for en sterk velferdsstat.',
        followUpQuestionsNo: [
          'Hvilke velferdsordninger mener du er viktigst?',
          'Kan en sjenerøs velferdsstat gjøre at folk tar mindre ansvar selv?',
          'Hvordan påvirker økende forskjeller mellom rike og fattige samfunnet?',
          'Hva kan andre land lære av den norske modellen, og omvendt?',
        ],
      },
    ],
  },
  {
    slug: 'handel-og-forbruk',
    titleNo: 'Handel og forbruk',
    descriptionNo: 'Shopping, personlig økonomi, netthandel og forbruksvaner.',
    sortOrder: 11,
    sets: [
      {
        slug: 'a-handle',
        titleNo: 'Å handle',
        level: 'B1',
        monologuePromptNo:
          'Fortell om hvor og hvordan du handler mat, klær og andre ting.',
        discussionPromptNo: 'Diskuter om det er bedre å handle i butikk eller på nettet.',
        followUpQuestionsNo: [
          'Hva var det siste du kjøpte på nettet?',
          'Sammenligner du priser før du kjøper noe?',
          'Hva synes du om prisene i Norge?',
          'Liker du å gå i butikker, eller synes du det er kjedelig?',
        ],
      },
      {
        slug: 'penger-og-sparing',
        titleNo: 'Penger og sparing',
        level: 'B1',
        monologuePromptNo:
          'Fortell hvordan du planlegger hva du bruker penger på hver måned.',
        discussionPromptNo:
          'Diskuter om barn bør få ukepenger, og om de må gjøre noe for å få dem.',
        followUpQuestionsNo: [
          'Sparer du til noe spesielt nå?',
          'Bruker du kontanter, kort eller mobil når du betaler?',
          'Hva er det verdt å bruke mye penger på?',
          'Har du kjøpt noe du har angret på?',
        ],
      },
      {
        slug: 'forbrukssamfunnet',
        titleNo: 'Forbrukssamfunnet',
        level: 'B2',
        monologuePromptNo:
          'Drøft hvordan forbrukssamfunnet påvirker miljøet og menneskers livskvalitet.',
        discussionPromptNo:
          'Diskuter om reklame rettet mot barn og unge bør forbys helt.',
        followUpQuestionsNo: [
          'Hvorfor tror du det er så vanskelig å endre forbruksvaner?',
          'Bør produsenter pålegges å lage produkter som varer lenger og kan repareres?',
          'Hvordan påvirker influensere hva unge kjøper?',
          'Kan økonomisk vekst kombineres med lavere forbruk?',
        ],
      },
      {
        slug: 'det-kontantlose-samfunnet',
        titleNo: 'Det kontantløse samfunnet',
        level: 'B2',
        monologuePromptNo:
          'Gjør rede for fordeler og ulemper ved at samfunnet blir stadig mer kontantløst og digitalt.',
        discussionPromptNo: 'Diskuter om alle butikker bør være pålagt å ta imot kontanter.',
        followUpQuestionsNo: [
          'Hvilke grupper kan få problemer i et heldigitalt samfunn?',
          'Hvordan påvirker digital betaling hvor mye penger vi bruker?',
          'Hva er risikoen ved at banker og teknologiselskaper vet så mye om oss?',
          'Bør skolen undervise mer i personlig økonomi?',
        ],
      },
    ],
  },
  {
    slug: 'medier-og-kommunikasjon',
    titleNo: 'Medier og kommunikasjon',
    descriptionNo: 'Sosiale medier, nyheter, mobilbruk og personvern.',
    sortOrder: 12,
    sets: [
      {
        slug: 'mobil-og-sosiale-medier',
        titleNo: 'Mobil og sosiale medier',
        level: 'B1',
        monologuePromptNo:
          'Fortell hvordan du bruker mobiltelefonen og sosiale medier i hverdagen.',
        discussionPromptNo:
          'Diskuter om det bør være en aldersgrense på 15 år for å bruke sosiale medier.',
        followUpQuestionsNo: [
          'Hvilke apper bruker du mest?',
          'Hvordan holder du kontakt med familie og venner i andre land?',
          'Kunne du klart deg en uke uten mobil?',
          'Hva bruker du internett til når du lærer norsk?',
        ],
      },
      {
        slug: 'nyheter-i-hverdagen',
        titleNo: 'Nyheter i hverdagen',
        level: 'B1',
        monologuePromptNo:
          'Fortell hvordan du får med deg nyheter. Leser du aviser, ser du på TV eller bruker du nettet?',
        discussionPromptNo: 'Diskuter om det er viktig å følge med på nyhetene hver dag.',
        followUpQuestionsNo: [
          'Hvilken nyhet har du lagt merke til den siste tiden?',
          'Leser eller ser du nyheter på norsk?',
          'Hvordan vet du om en nyhet er sann?',
          'Liker du best lokale eller internasjonale nyheter?',
        ],
      },
      {
        slug: 'falske-nyheter-og-demokrati',
        titleNo: 'Falske nyheter og demokrati',
        level: 'B2',
        monologuePromptNo:
          'Drøft hvordan falske nyheter og desinformasjon kan påvirke demokratiet.',
        discussionPromptNo:
          'Diskuter om teknologiselskapene bør ha ansvar for å fjerne feilaktig informasjon fra plattformene sine.',
        followUpQuestionsNo: [
          'Hvor går grensen mellom å fjerne desinformasjon og å begrense ytringsfriheten?',
          'Hvordan kan skolen lære elevene kildekritikk?',
          'Hvilken rolle har redaktørstyrte medier i dag?',
          'Har sosiale medier gjort den offentlige debatten bedre eller verre?',
        ],
      },
      {
        slug: 'personvern-og-overvaking',
        titleNo: 'Personvern og overvåking',
        level: 'B2',
        monologuePromptNo:
          'Gjør rede for hvilke utfordringer for personvernet som følger av at vi deler så mye informasjon digitalt.',
        discussionPromptNo:
          'Diskuter om det er akseptabelt med mer kameraovervåking i det offentlige rom for å bekjempe kriminalitet.',
        followUpQuestionsNo: [
          'Hvor mye bryr du deg om hva som skjer med personopplysningene dine?',
          'Bør foreldre legge ut bilder av barna sine på sosiale medier?',
          'Hvordan kan staten beskytte innbyggerne mot overvåking fra store teknologiselskaper?',
          'Er det greit at arbeidsgivere sjekker sosiale medier før de ansetter noen?',
        ],
      },
    ],
  },
  {
    slug: 'reise-og-ferie',
    titleNo: 'Reise og ferie',
    descriptionNo: 'Ferieopplevelser, turisme og reisevaner.',
    sortOrder: 13,
    sets: [
      {
        slug: 'en-reise-jeg-husker',
        titleNo: 'En reise jeg husker',
        level: 'B1',
        monologuePromptNo:
          'Fortell om en ferie eller reise du husker godt. Hvor dro du, og hva opplevde du?',
        discussionPromptNo:
          'Diskuter om det er bedre å feriere i Norge eller å reise til utlandet.',
        followUpQuestionsNo: [
          'Hvor ville du reist hvis du kunne velge fritt?',
          'Liker du best å reise alene eller sammen med andre?',
          'Hva tar du alltid med deg på reise?',
          'Hvilket sted i Norge vil du anbefale til turister?',
        ],
      },
      {
        slug: 'sommerferie-og-fridager',
        titleNo: 'Sommerferie og fridager',
        level: 'B1',
        monologuePromptNo:
          'Fortell hva du liker å gjøre når du har fri fra jobb eller skole om sommeren.',
        discussionPromptNo:
          'Diskuter om det er bedre med én lang sommerferie eller flere korte ferier i løpet av året.',
        followUpQuestionsNo: [
          'Hva gjorde du i den siste ferien din?',
          'Har du vært på hytte i Norge?',
          'Hvordan feirer folk ferie i landet du kommer fra?',
          'Planlegger du ferien lenge før, eller bestemmer du deg i siste liten?',
        ],
      },
      {
        slug: 'turisme-og-reisemal',
        titleNo: 'Turisme og reisemål',
        level: 'B2',
        monologuePromptNo:
          'Drøft hvilke positive og negative konsekvenser turisme har for populære reisemål.',
        discussionPromptNo:
          'Diskuter om populære turiststeder i Norge bør innføre turistskatt eller begrense antall besøkende.',
        followUpQuestionsNo: [
          'Hvordan kan turismen bli mer bærekraftig?',
          'Bør cruiseskip få legge til kai i trange fjorder?',
          'Hvordan påvirker turismen hverdagen til lokalbefolkningen?',
          'Er det riktig at folk med god råd kan fly så mye de vil?',
        ],
      },
      {
        slug: 'reisevaner-og-klima',
        titleNo: 'Reisevaner og klima',
        level: 'B2',
        monologuePromptNo:
          'Gjør rede for hvordan reisevanene våre påvirker klimaet, og drøft om vi bør endre dem.',
        discussionPromptNo:
          'Diskuter om det bør innføres en grense for hvor mange flyreiser hver person kan ta per år.',
        followUpQuestionsNo: [
          'Kan digitale møter erstatte jobbreiser?',
          'Hva betyr reiser for forståelsen mellom kulturer?',
          'Bør tog i Europa bli billigere enn fly?',
          'Hvem bør ta regningen for klimautslippene fra reiselivet?',
        ],
      },
    ],
  },
];
