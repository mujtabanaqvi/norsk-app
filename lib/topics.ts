export interface ExamTopic {
  id: string;
  level: 'B1' | 'B2';
  title: string;
  topicPrompt: string;
  instructionsNo: string;
  keyDiscussionPoints: string[];
}

export const TOPIC_CATALOG: Record<string, ExamTopic> = {
  'kollektivtransport-gratis': {
    id: 'kollektivtransport-gratis',
    level: 'B1',
    title: 'Bør kollektivtransport være gratis for alle?',
    topicPrompt:
      'Diskuter om buss, tog og trikk bør være gratis for alle innbyggere. Vurder fordeler for miljø og økonomi mot kostnader for samfunnet.',
    instructionsNo:
      'Du og din samtalepartner skal snakke sammen i 5-7 minutter. Begge må begrunne sine synspunkter og stille spørsmål til hverandre.',
    keyDiscussionPoints: [
      'Redusert biltrafikk og miljøfordeler',
      'Hvordan staten/kommunen skal finansiere gratis transport',
      'Erfaringer fra byer som har prøvd det (f.eks. Stavanger eller Tallinn)',
      'Kvalitet og kapasitet på buss og tog hvis alt blir gratis',
    ],
  },
  'hjemmekontor-vs-kontor': {
    id: 'hjemmekontor-vs-kontor',
    level: 'B1',
    title: 'Hjemmekontor eller fysisk oppmøte på arbeidsplassen?',
    topicPrompt:
      'Diskuter fordelene og ulempene med hjemmekontor sammenlignet med å jobbe fysisk på arbeidsplassen. Hvordan påvirker det trivsel, produktivitet og balanse mellom jobb og fritid?',
    instructionsNo:
      'Gjør rede for ditt eget syn og lytt til samtalepartneren. Vis at du kan følge opp motargumenter.',
    keyDiscussionPoints: [
      'Tidsbesparelse ved å slippe pendling',
      'Sosialt fellesskap og faglig samarbeid mellom kolleger',
      'Skille mellom arbeidstid og fritid',
      'Tillit mellom arbeidsgiver og arbeidstaker',
    ],
  },
  'mobilforbud-skole': {
    id: 'mobilforbud-skole',
    level: 'B2',
    title: 'Bør mobiltelefoner forbys i grunnskolen og videregående?',
    topicPrompt:
      'Drøft om et totalforbud mot mobiltelefoner i skolen fremmer læring og trivsel, eller om skolen heller bør trene elevene i digital dømmekraft.',
    instructionsNo:
      'På B2-nivå forventes nyansert argumentasjon, bruk av presist ordforråd og evne til å reflektere over komplekse samfunnsmessige konsekvenser.',
    keyDiscussionPoints: [
      'Konsentrasjon og faglig utbytte i timene',
      'Mobbing og sosialt press i friminuttene',
      'Digital kompetanse og pedagogisk bruk av teknologi',
      'Foreldrenes og lærernes ansvar',
    ],
  },
  'kunstig-intelligens-arbeidsliv': {
    id: 'kunstig-intelligens-arbeidsliv',
    level: 'B2',
    title: 'Kunstig intelligens i arbeidslivet: trussel eller mulighet?',
    topicPrompt:
      'Drøft hvordan utviklingen innen kunstig intelligens vil forandre det norske arbeidsmarkedet de neste tiårene. Hvilke etiske og samfunnsmessige utfordringer oppstår?',
    instructionsNo:
      'Formuler velbegrunnede argumenter med språklig variasjon, hensiktsmessige bindeord og god hypotetisk drøfting.',
    keyDiscussionPoints: [
      'Automatisering av rutineoppgaver vs. nye typer arbeidsplasser',
      'Behov for omskolering og livslang læring',
      'Etiske dilemmaer rundt vurdering og beslutninger tatt av algoritmer',
      'Norges konkurransekraft og velferdssystem',
    ],
  },
};

/**
 * Retrieves topic metadata or falls back to a generated prompt
 */
export function getTopicById(
  topicId: string,
  level: 'B1' | 'B2'
): { id: string; title: string; topicPrompt: string } {
  const existing = TOPIC_CATALOG[topicId];
  if (existing) {
    return {
      id: existing.id,
      title: existing.title,
      topicPrompt: existing.topicPrompt,
    };
  }

  // Graceful fallback for dynamically provided custom topics
  const fallbackTitle = topicId
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return {
    id: topicId,
    title: fallbackTitle,
    topicPrompt: `Muntlig eksamenstema (${level}): ${fallbackTitle}. Drøft fordeler, ulemper og personlige erfaringer.`,
  };
}

