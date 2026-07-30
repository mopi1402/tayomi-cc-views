# Architecture : les cinq décisions qui portent le moteur

Prose de conception, à lire avec le code sous les yeux. Les références normatives
sont [view-language.md](view-language.md) et [display-host.md](display-host.md) ;
ici on explique pourquoi le moteur a cette forme, et ce que chaque décision a coûté
ou évité.

## 1. La chaîne de couches

`style ← layout ← template ← carrier ← pipeline` : chaque couche n'importe que vers
la gauche. `style.ts` est la feuille (le vocabulaire ANSI, aucune notion de
géométrie ni de données) ; `layout/` mesure et encadre ; `template/` parse et
substitue ; `carrier/` reconnaît les zones d'un message ; `pipeline.ts` est la
seule pièce qui voit tout et compose dans le seul ordre sûr. `scope.ts` vit à la
racine, à côté de `style.ts`, parce que deux couches qui ne doivent pas dépendre
l'une de l'autre le consomment (le substituteur et le mesureur de colonnes).

Trois règles complètent la chaîne, vérifiées par un gate dans le repo hôte : un
seul `main()` par process (un module de bord importé dans un bundle a déjà volé le
stdin d'un autre hook), le bord est une feuille (rien n'importe `hook/runner.ts`),
et aucun cycle. La conséquence pratique : on peut tester chaque étage sans monter
les étages au-dessus.

## 2. Le streaming en tranche pure

MessageDisplay livre un message flush par flush, et des flushs CONCURRENTS.
`slice()` est une fonction PURE du texte accumulé avant le flush et du delta du
flush : elle recalcule la transformation du message entier, puis n'émet que la
tranche nouvellement révélée. Aucun offset n'est mémorisé entre deux flushs ;
c'était la version d'avant, et trois flushs en vol ont perdu des mises à jour sur
cet état partagé. Payer une seconde transformation par flush est le prix de la
convergence : les tranches concaténées égalent la cible, quel que soit
l'entrelacement.

La rétention suit la même logique : une zone encore en train d'arriver (fence
ouverte, zone décorée dont la fin n'est pas connue) est coupée de la sortie avant
que le carrier la voie, puis révélée rendue au delta final. Un delta déjà montré ne
peut pas être repris ; c'est la contrainte qui dicte tout le design, et elle
laisse un résidu assumé : un marqueur coupé en plein milieu (`{{sta`, `@{view:ta`)
peut atteindre l'écran brut avant de se compléter.

## 3. Le polyfill de largeur

Le process du hook ne voit pas le terminal : son stdout est un pipe, l'environnement
ne porte pas la taille, `/dev/tty` répond ENXIO. Or la box doit envelopper son
contenu elle-même, sinon le terminal replie les lignes longues à sa guise et
déchiquette le cadre. La réponse est un polyfill assumé : remonter la chaîne des
ancêtres par `ps`, ouvrir le tty du process `claude`, lire ses colonnes, et mettre
en cache (TTL 3 s) parce que la sonde coûte ~25 ms et que le hook tourne à chaque
delta.

L'ordre de résolution rend chaque étage débrayable : un nombre dans les options
(le plafond forcé d'un oracle), la variable d'environnement (le plafond de
l'opérateur), une fonction source, la sonde, 100 par défaut. Le déclencheur de
réouverture est documenté : le jour où le payload du hook porte la taille du
terminal, elle devient une source de plus, zéro changement d'API.

## 4. Le trade du décorateur

Le bloc fencé a un défaut structurel : relu depuis le transcript (là où le hook ne
tourne pas), il redevient un mur de code. Le décorateur inverse le marché : le
payload EST du markdown ordinaire (un tableau à deux colonnes), et une seule ligne
au-dessus nomme le template et le type sémantique. Le fallback devient natif par
construction : au pire, le lecteur voit un tableau normal sous une ligne en plus.

Deux principes en découlent. L'engagement se fait sur l'INTENTION, jamais sur la
forme : un tableau non décoré, quel qu'il soit, traverse l'écran octet pour octet
(la leçon du POC retiré, qui capturait les tableaux par leur forme). Et le
fail-open est total, ligne de décorateur incluse : l'écran montre exactement ce que
le transcript détient, y compris le cas du template creux qui ne lit aucun champ
(un blanc à la place du contenu serait pire que le brut).

## 5. La palette process-global

Le vocabulaire `{{tag}}` n'est pas une option par appel mais un registre global au
process (`extendTags`), et c'est un choix de cohérence, pas de commodité : les
feuilles du layout MESURENT à travers ce vocabulaire (un tag connu pèse zéro
colonne, un tag inconnu est du texte), pendant que le renderer le RÉSOUT. Deux
ensembles distincts feraient mentir toutes les largeurs. Le registre est additif
seulement : redéfinir un tag existant lève une erreur, parce qu'une ombre changerait
la langue sous les pieds de tous les templates déjà écrits.
