export const highways: Array<Array<[number, number]>> = [
  [
    [50.0755, 14.4378],
    [49.7813, 14.6850],
    [49.5420, 15.3590],
    [49.3964, 15.5912],
    [49.3540, 16.0100],
    [49.2775, 16.5660],
    [49.1951, 16.6068],
    [49.4100, 17.0000],
    [49.8209, 18.2625],
  ], // D1: Prague → Benešov → Humpolec → Jihlava → Velké Meziříčí → Brno → Ostrava
  [
    [49.1951, 16.6068],
    [48.9393, 16.7406],
    [48.7595, 16.8820],
  ], // D2: Brno → Hustopeče → Břeclav
  [
    [50.0755, 14.4378],
    [49.7813, 14.6850],
    [49.4144, 14.6588],
    [49.1850, 14.7000],
    [48.9747, 14.4747],
  ], // D3: Prague → Benešov → Tábor → Veselí nad Lužnicí → České Budějovice
  [
    [50.0755, 14.4378],
    [49.9643, 14.0741],
    [49.7390, 13.5910],
    [49.7465, 13.3776],
    [49.7090, 13.0000],
    [49.6631, 12.7777],
  ], // D5: Prague → Beroun → Rokycany → Plzeň → Stříbro → Rozvadov
  [
    [50.0755, 14.4378],
    [50.1510, 13.7900],
    [50.2321, 12.8714],
    [50.0796, 12.3739],
  ], // D6: Prague → Nové Strašecí → Karlovy Vary → Cheb
  [
    [50.0755, 14.4378],
    [50.2300, 14.0850],
    [50.3500, 13.7970],
    [50.4069, 13.4188],
    [50.4920, 13.0258],
  ], // D7: Prague → Slaný → Louny → Chomutov
  [
    [50.0755, 14.4378],
    [50.5175, 14.0450],
    [50.66, 14.0416],
    [50.7750, 14.1000],
    [50.9013, 14.2540],
  ], // D8: Prague → Lovosice → Ústí nad Labem → Petrovice (DE border)
  [
    [50.0755, 14.4378],
    [50.4106, 14.9070],
    [50.5865, 15.1496],
    [50.7670, 15.0670],
  ], // D10: Prague → Mladá Boleslav → Turnov → Liberec
  [
    [50.0755, 14.4378],
    [50.1430, 15.1170],
    [50.2092, 15.8328],
    [50.0343, 15.7812],
    [49.7890, 16.9170],
    [49.5938, 17.2509],
    [49.5178, 17.5833],
  ], // D11 + D35 corridor: Prague → Poděbrady → Hradec Králové → Pardubice → Mohelnice → Olomouc → Lipník nad Bečvou
  [
    [49.1951, 16.6068],
    [48.9870, 16.5230],
    [48.8052, 16.6376],
  ], // D52: Brno → Pohořelice → Mikulov
  [
    [49.5938, 17.2509],
    [49.4550, 17.4500],
    [49.2236, 17.5320],
    [49.2264, 17.6707],
    [49.0681, 17.4634],
  ], // D55: Olomouc → Přerov → Otrokovice → Zlín → Uherské Hradiště
];

export const cities: Array<
  { name: string; lat: number; lng: number; weight: number; sigma: number }
> = [
  { name: "Prague", lat: 50.0755, lng: 14.4378, weight: 5, sigma: 0.035 },
  { name: "Brno", lat: 49.1951, lng: 16.6068, weight: 3, sigma: 0.03 },
  { name: "Ostrava", lat: 49.8209, lng: 18.2625, weight: 2, sigma: 0.03 },
  { name: "Plzen", lat: 49.7465, lng: 13.3776, weight: 1.5, sigma: 0.025 },
  { name: "Liberec", lat: 50.7671, lng: 15.0562, weight: 1, sigma: 0.02 },
  { name: "Olomouc", lat: 49.5938, lng: 17.2509, weight: 1, sigma: 0.02 },
  {
    name: "CeskeBudejovice",
    lat: 48.9747,
    lng: 14.4749,
    weight: 0.8,
    sigma: 0.02,
  },
  {
    name: "HradecKralove",
    lat: 50.2092,
    lng: 15.8328,
    weight: 0.9,
    sigma: 0.02,
  },
  {
    name: "Pardubice",
    lat: 50.0343,
    lng: 15.7812,
    weight: 0.7,
    sigma: 0.02,
  },
  { name: "Usti", lat: 50.66, lng: 14.0416, weight: 0.8, sigma: 0.02 },
  {
    name: "KarlovyVary",
    lat: 50.2311,
    lng: 12.8716,
    weight: 0.5,
    sigma: 0.015,
  },
  { name: "Zlin", lat: 49.2264, lng: 17.6706, weight: 0.6, sigma: 0.015 },
];
