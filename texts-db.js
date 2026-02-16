
// struktura:
// TextDB = {
//   cs: { feedPhrases: [...], questions: [...] },
//   ru: { ... },
//   en: { ... }
// }

const TextDB = {
  cs: {
    feedPhrases: [
      'On šel k lékaři pro život, lékař vystavil účet za pohřeb.',
      'Zkusil nastartovat auto v zimě – auto vyhlásilo stávku a odjelo.',
      'Koupil budík – ten spal déle než on.',
      'Na večírek pozvali všechny, kromě života.',
      'Rozhodl se zhubnout – lednice na něj podala žalobu za týrání.',
      'V práci byl na zkušebce – mozek testem neprošel.',
      'Šel na ryby – ryba se nad ním slitovala první.',
      'Zavolal na podporu života – tam to nikdo nezvedl.',
      'Koupil dům s historií – historie utekla půdou.',
      'Plánoval útěk před problémy – problémy už čekaly na nádraží.'
    ],
    questions: [
      'Kdyby byl déšť barevný, která barva by v tobě vyvolávala smutek?',
      'Proč si lednice nikdy nestěžuje na samotu, i když je světlo pořád rozsvícené?',
      'Co když jsou tvoje myšlenky tajná předplatná, o kterých ani nevíš?',
      'Dá se unavit z vlastních snů?',
      'Kdyby stěny uměly šeptat, co by řekly sousedům?',
      'Proč konvice vždy píská, když je šťastná?',
      'Kdyby šel čas vrátit jen pro kočky, co by se ve světě změnilo?',
      'Jaká vůně připomíná nesplněné sliby?',
      'Co když si ulice pamatují všechno, co po nich prošlo, a jen mlčky trucují?',
      'Proč hodiny jdou dál, i když se na ně nikdo nedívá?',
      'Dá se říct, že zapomené věci žijí vlastním životem?',
      'Co když se zítřek rozhodne nepřijít?',
      'Kdyby lidé uměli létat, kdo by toho litoval jako první?',
      'Proč se na fotkách lidé smějí a v životě pláčou?',
      'Co když je internet jen kolektivní iluze?'
    ]
  },
  ru: {
    feedPhrases: [
      'Он пошёл к врачу за жизнью, а врач выписал счёт за похороны.',
      'Попытался завести машину зимой — машина устроила забастовку и уехала.',
      'Купил будильник — он спал дольше, чем я.',
      'На вечеринку пригласили всех, кроме жизни.',
      'Он решил похудеть — холодильник подал на него в суд за жестокое обращение.',
      'Работу устроили на испытательный срок — а мозг не прошёл проверку.',
      'Пошёл на рыбалку — рыба пожалела его первой.',
      'Он позвонил в службу поддержки жизни — там никто не взял трубку.',
      'Купил дом с историей — а история сбежала через чердак.',
      'Планировал побег от проблем — проблемы устроили встречу на вокзале.'
    ],
    questions: [
      'Если бы дождь был цветным, какой цвет вызывал бы у тебя тоску?',
      'Почему холодильник никогда не жалуется на одиночество, хотя свет всегда включён?',
      'Что если твои мысли — это тайные подписки, о которых ты сам не знаешь?',
      'Можно ли устать от собственных снов?',
      'Если бы стены умели шептать, что бы они сказали соседям?',
      'Почему чайник всегда свистит, когда он счастлив?',
      'Если бы можно было вернуть время назад, но только для котов, что бы изменилось в мире?',
      'Какой запах напоминает о невыполненных обещаниях?',
      'Что если улицы помнят всё, что по ним проходило, и просто злятся молча?',
      'Почему часы идут, даже когда никто не смотрит?',
      'Можно ли считать, что забытые вещи живут собственной жизнью?',
      'Что если завтра решит не наступать?',
      'Если бы люди умели летать, кто бы первым пожалел об этом?',
      'Почему фотографии улыбаются, а люди плачут?',
      'Что если интернет — это просто коллективная иллюзия?'
    ]
  },
  en: {
    feedPhrases: [
      'He went to the doctor for a new life, the doctor sent him the funeral bill.',
      'Tried to start the car in winter — the car went on strike and left.',
      'Bought an alarm clock — it slept longer than he did.',
      'Everyone was invited to the party except life itself.',
      'He decided to lose weight — the fridge sued him for cruelty.',
      'Got a job on probation — his brain failed the test.',
      'Went fishing — the fish felt sorry for him first.',
      'He called life support — nobody picked up.',
      'Bought a house with a history — the history escaped through the attic.',
      'Planned to run away from problems — the problems were already waiting at the station.'
    ],
    questions: [
      'If rain had colors, which color would make you sad?',
      'Why does the fridge never complain about loneliness, even though the light is always on?',
      'What if your thoughts are secret subscriptions you never agreed to?',
      'Can you get tired of your own dreams?',
      'If walls could whisper, what would they tell the neighbors?',
      'Why does the kettle always whistle when it is happy?',
      'If you could rewind time only for cats, what would change in the world?',
      'What smell reminds you of broken promises?',
      'What if streets remember everything that has walked them and are silently angry?',
      'Why do clocks keep going even when no one is watching?',
      'Can we say forgotten things live their own lives?',
      'What if tomorrow decides not to come?',
      'If people could fly, who would regret it first?',
      'Why do photos smile while people cry?',
      'What if the internet is just a collective illusion?'
    ]
  }
};

// Делаем доступным глобально
window.TextDB = TextDB;

