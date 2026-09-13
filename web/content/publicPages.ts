export type PublicLocale = "ja" | "en";

export function publicLocale(locale: string): PublicLocale {
  return locale === "ja" ? "ja" : "en";
}

export const publicPages = {
  ja: {
    home: {
      title: ["現場の手作業を撮影し、", "ロボット開発に活かし、", "現場に収益を還す。"],
      intro: [
        "RootLensは、日本を拠点に、あらゆる業種の現場とフィジカルAI業界をつなぐプロジェクトです。",
        "現場の手作業データを、ロボティクス分野の研究開発に活かせる形で収集し、得られた利益を現場に還元します。",
      ],
      backgroundTitle: "背景",
      background: [
        "ロボットに現場作業を学習させるには、実際の作業環境において人がどう動き、物体とどう関わり、作業がどう進行するかを記録したデータが必要です。",
        "ロボティクス産業では多種多様な現場データへの需要が拡大しています。一方、多くの現場にとっては、そうした需要の存在自体を知らない、あるいは知っていても研究開発に使えるデータをどう集めればいいかわからない、というのが実情です。",
      ],
      businessTitle: "事業内容",
      business: [
        "私たちは、こうしたデータを、現場との合意のもと、適切な撮影機材を用いて、現場に負担をかけずに収集する役割を担います。",
        "ロボティクス企業にとっては、権利関係の明確なエゴセントリックデータの収集網として。多くの産業現場にとっては、撮影で得られる新たな収入源として。その両面を支えるサービスです。",
      ],
      entries: [
        ["撮影に協力", "/contribute"],
        ["データの購入", "/buy"],
        ["データポリシー", "/data-policy"],
      ],
    },
    contribute: {
      label: "撮影先の方へ",
      title: "撮影協力について",
      lead: "現場の手作業を一人称視点で撮影し、ロボット開発用のデータとして提供します。撮影の範囲と条件は事前に取り決め、現場が承認したデータのみを扱います。",
      captureTitle: "何を撮影するか",
      captureBody: [
        "撮影機材を装着したスタッフの一人称視点で、作業中の手元の映像と音声を撮影します。あわせて、撮影機材に搭載されたIMUセンサーが、機材の動きと向きを記録します。",
        "撮影のための特別な動作は必要なく、撮影機材を装着した状態で普段の業務を行っていただきます。",
      ],
      preparationTitle: "撮影開始までの準備",
      preparationLead: "撮影を開始するには、当社と協力先（撮影に協力いただく現場の事業者）の合意と、現場スタッフの同意が必要です。",
      preparation: [
        {
          title: "現場合意書の締結",
          body: "撮影の範囲、データの用途と利用制限、撮影協力費の条件、データの承認手順、中止・削除の方法について当社と協力先で取り決め、現場合意書を締結します。",
        },
        {
          title: "現場スタッフの同意",
          body: "撮影に参加するスタッフ、および撮影中に映り込む可能性のあるスタッフ全員に、撮影されるデータの内容、利用目的、国内外の企業・研究機関への提供、参加中止の方法を説明した上で、同意書に署名してもらいます。参加は本人の自由意思によります。",
        },
      ],
      equipmentTitle: "撮影機材と撮影方法",
      equipmentBody: "撮影に用いる機材は当社が用意し、撮影期間中、現場に貸与します。スタッフは機材を装着し、所定の手順で撮影を開始し、普段どおり業務を行います。撮影方法は当社が事前に説明します。",
      equipmentListTitle: "機材リスト",
      equipment: [
        {
          name: "TOBI E2",
          specs: "公称：RGBグローバルシャッターカメラ×2／1080p・60fps／IMU 1kHz／150g未満／5時間超",
          src: "/devices/tobi-e2.webp",
          width: 994,
          height: 694,
        },
        { name: "RootGlass（スマートグラス）", src: "/devices/rootglass.jpg", width: 1258, height: 998 },
        { name: "RootCap（帽子型カメラ）", src: "/devices/rootcap.jpg", width: 3600, height: 2196 },
      ],
      equipmentNoticeTitle: "注意事項",
      equipmentNotice: "機材は撮影以外の目的には使用できません。紛失・故障・破損が生じた場合は当社に連絡してください。通常の使用による劣化や消耗について、協力先が費用を負担することはありません。故意または重大な過失による紛失・破損については、当社と協力先で協議します。合意の終了時、または当社から返却を求めた際に、機材を返却してください。",
      useTitle: "データの用途と利用制限",
      useBody: "撮影データは、AI・ロボットの研究開発の目的に限って利用します。この範囲内で、当社は撮影データの保管・加工・分析を行い、国内外の企業・研究機関に提供します。提供先に対しても同じ目的の制限を課します。",
      prohibitedLead: "以下の目的には利用せず、提供先にも認めません。",
      prohibited: [
        "撮影された個人の特定や追跡",
        "広告や娯楽コンテンツとしての公開",
      ],
      outsourcingBody: "撮影データの加工・分析等の業務は、当社の委託先に委託する場合があります。委託先に対しても上記と同じ制限を課し、当社が管理・監督します。委託先の名称と委託内容は、協力先からの求めに応じて開示します。",
      feeTitle: "撮影協力費",
      feeBody: [
        "撮影協力費は、販売先に採用されたデータの時間数と、事前に合意した条件に基づいて算出します。販売先に採用されなかったデータに対して撮影協力費は発生しません。",
        "採用基準は販売先によって異なりますが、手と物体が十分に画角に写っていることが主な条件となります。",
        "当社が販売先から対価を受領した月の末日で締め、翌月末日までに協力先の指定口座へ支払います。振込手数料は当社が負担します。",
        "撮影協力費の算出方法は、協力先ごとに個別にご相談の上決定します。",
        "なお、合意の終了前にすでに販売先へ提供済みのデータが、終了後に採用された場合も、同じ条件で撮影協力費を支払います。",
      ],
      controlTitle: "データの事前チェック・中止・削除",
      controls: [
        {
          title: "事前チェック",
          body: [
            "撮影後、現場監督者は映像と音声を確認し、提供してよいデータのみを承認します。承認は、撮影機材とPCを接続し、当社が提供するアプリケーション上で行います。当社は承認されたデータのみを販売先に提供します。",
            "承認されたデータには匿名化処理を施します。具体的には、意図せず映り込んだ第三者、およびナンバープレート・名札・書類のマスキング処理を行います。なお、事前チェックの段階で、提供しても問題のない映像のみを選定してください。",
            "匿名化処理の完了後7日間は販売先に提供しません。この期間中、現場にて処理後の内容を確認できます。",
          ],
        },
        {
          title: "中止",
          body: ["協力先および撮影者は、いつでも撮影への参加を中止できます。中止にあたって理由の説明は不要です。また、協力先・撮影者のいずれからでも、当社にその旨を伝えていただくことで合意そのものを終了できます。"],
        },
        {
          title: "削除",
          body: [
            "販売先への提供前のデータは、協力先または撮影者の申し出により削除します。合意が終了した場合も、提供前のデータは速やかに削除します。",
            "販売先に提供済みのデータについて削除の申し出を受けた場合、当社は販売先に利用停止と削除を求めます。ただし、提供済みのデータをすべて回収・削除できない場合があります。また、撮影データがすでにAIの学習に使用されている場合、その影響を学習結果から取り除くことはできません。",
          ],
        },
      ],
    },
    buy: {
      label: "研究開発・データ調達の方",
      title: "実際の現場で収集した、一人称視点データ。",
      overviewTitle: "概要",
      overview: [
        "当社は日本を拠点に、飲食、小売、製造、リフォーム等、幅広い業種の現場における一人称視点データの収集を行っております。現在は飲食業を中心に協力先のネットワークを拡大しています。",
        "撮影デバイスについても、複数の機材を実際の収集に用いながら、選定と改善を進めています。現場の業務への影響、装着者の身体的負担、取得されるエゴセントリックデータの品質を検証しながら、収集体制の改善を続けています。",
      ],
      designTitle: "収集条件の設計",
      designBody: "対象業務、収集時間、センサー構成、納品形式は、研究目的やモデル要件に応じて設計できます。必要に応じて、対象範囲の切り出しやアノテーションを施した上での提供にも対応します。",
      provenanceTitle: "データの来歴",
      provenanceBody: "提供するデータには、協力先との事前合意、撮影スタッフの事前同意、現場監督者の承認の記録が紐付いています。提供データから各記録を遡及できる状態で管理しています。",
      provenanceAction: "データポリシーを見る",
      previewTitle: "データプレビュー",
      contactTitle: "お問い合わせ",
      contactBody: "対象業務、時間数、デバイス、納品形式、希望時期をお伝えください。収集の可否と概算をご案内します。",
      contactAction: "要件を相談する",
    },
    policy: {
      label: "データポリシー",
      summary: "RootLensは、協力先から取得した撮影データを、AI・ロボットの研究開発を行う企業・研究機関（以下「販売先」）に提供します。データが販売先に届くまでに、三つの段階を設けています。",
      steps: [
        {
          title: "01 撮影前の同意",
          short: "協力先との合意と、現場スタッフ個人の同意を、撮影開始前に取得します。",
        },
        {
          title: "02 提供前の確認・承認",
          short: "協力先が確認し、承認したデータだけが提供工程に進みます。",
        },
        {
          title: "03 証跡の管理",
          short: "データと各同意・承認の記録を識別子で紐付けます。",
        },
      ],
      agreementTitle: "01 撮影前の同意",
      agreementBody: [
        "撮影データの取得には、二種類の同意を必要としています。撮影場所を管理する事業者（協力先）との合意と、現場スタッフ個人の同意です。",
        "協力先との合意は現場合意書として取り交わします。現場スタッフの同意は、撮影機材を装着するスタッフおよび撮影中に映り込む可能性のある現場スタッフから取得します。",
      ],
      siteDoc: ["現場合意書", "撮影場所を管理する事業者と当社の間で締結する合意書です。撮影の対象範囲、撮影データの用途と利用制限、撮影協力費の条件、提供前のデータ承認の手順、中止・削除時の対応、撮影機材の貸与と返却、秘密保持について定めています。"],
      staffDoc: ["撮影参加に関する同意書", "撮影機材を装着する方、および撮影中に映り込む可能性のある方が確認し、署名する同意書です。記録されるデータの種類、利用目的、国内外の企業・研究機関への提供、参加の中止方法、撮影データの削除の申し出と、提供済みデータに関する制約について説明しています。"],
      documentsAction: "書類の全文を請求する",
      approvalTitle: "02 提供前の確認・承認",
      approvalBody: [
        "撮影されたデータは、協力先の現場監督者がすべて確認した上で、提供してよいものだけを承認します。承認は、当社が提供するアプリケーション上で行います。",
        "未承認のデータが撮影機材から自動的に外部へ送信されることはありません。承認されたデータだけがアップロードされ、以降の工程に進みます。",
      ],
      appTitle: "RootLens Importer",
      appBody: "撮影機材をPCに接続し、録画の取り込み、映像・音声の確認、承認済みデータのアップロードを行うアプリケーションです。撮影開始時に各協力先へ専用の認証ファイルを共有し、このファイルによって初回ログインを行う仕組みです。",
      appAction: "アプリをダウンロード",
      evidenceTitle: "03 証跡の管理",
      evidenceLead: "各データには内容から算出した識別子を付与し、以下の記録と紐付けます。",
      evidenceFields: ["協力先の事前合意記録", "スタッフの事前同意記録", "現場監督者の承認記録", "各文書のバージョン番号"],
      evidenceBody: "販売先に提供するデータから、これらの記録を遡って確認できる状態を維持します。",
      processingTitle: "承認後の処理",
      processingAndLimitsTitle: "承認後の処理と利用目的の制限",
      processingBody: [
        "承認済みデータには、意図せず映り込んだ第三者の顔、ナンバープレート、名札、書類等のマスキング処理を行います。",
        "処理完了から7日間の猶予期間を置いた上で、販売先への提供を開始します。この期間中に問題が確認された場合は、提供を取り下げることができます。",
      ],
      limitsTitle: "利用目的の制限",
      limitsLead: "撮影データは、AI・ロボットの研究開発にのみ利用します。当社・販売先・委託先・協力先のいずれも、以下の用途には使用できません。",
      limits: ["映っている人物の特定や追跡", "勤怠管理や人事評価への転用", "広告・娯楽コンテンツとしての公開"],
    },
  },
  en: {
    home: {
      title: ["We record hands-on work,", "put it to use in robotics development,", "and return revenue to workplaces."],
      intro: [
        "RootLens is a Japan-based project connecting workplaces across industries with the physical AI sector.",
        "We collect hands-on work data in a form that can support robotics research and development, then return the resulting revenue to the workplaces.",
      ],
      backgroundTitle: "Background",
      background: [
        "Teaching robots how to work on site requires data recorded in real working environments: how people move, interact with objects, and carry out each task.",
        "Demand for diverse workplace data is growing across robotics. Yet many workplaces are unaware that this demand exists or do not know how to collect data that research and development teams can use.",
      ],
      businessTitle: "What we do",
      business: [
        "With each workplace's agreement, we use appropriate recording equipment to collect this data without disrupting ordinary work.",
        "For robotics companies, RootLens provides a collection network for egocentric data with clear rights. For industrial workplaces, it offers a new source of income from recording. The service supports both sides.",
      ],
      entries: [
        ["Contribute", "/contribute"],
        ["Buy data", "/buy"],
        ["Data policy", "/data-policy"],
      ],
    },
    contribute: {
      label: "For participating workplaces",
      title: "About contributing",
      lead: "We record hands-on work from a first-person perspective and provide it as data for robotics development. The recording scope and conditions are agreed in advance, and we handle only data approved by the workplace.",
      captureTitle: "What we record",
      captureBody: [
        "We record video and audio of hands at work from the first-person perspective of a staff member wearing the capture device. An IMU sensor in the device also records its movement and orientation.",
        "No special actions are required for filming. Staff carry out their ordinary work while wearing the capture device.",
      ],
      preparationTitle: "Before filming begins",
      preparationLead: "Filming requires an agreement between RootLens and the participating workplace, together with consent from the staff involved.",
      preparation: [
        {
          title: "Workplace agreement",
          body: "RootLens and the workplace agree on the filming scope, data purposes and restrictions, filming fee, data approval process, and the process for stopping participation or deleting data.",
        },
        {
          title: "Staff consent",
          body: "We explain the recorded data, its purposes, provision to companies and research institutions in Japan and overseas, and how to stop participating to everyone who will record or may appear in a recording. Each person then signs a consent form. Participation is voluntary.",
        },
      ],
      equipmentTitle: "Equipment and filming method",
      equipmentBody: "RootLens provides the equipment and lends it to the workplace for the filming period. Staff wear the equipment, start recording according to the specified procedure, and carry out their ordinary work. We explain the filming method in advance.",
      equipmentListTitle: "Equipment",
      equipment: [
        {
          name: "TOBI E2",
          specs: "Published specifications: 2× RGB global-shutter cameras / 1080p at 60 fps / 1 kHz IMU / under 150 g / over 5 hours",
          src: "/devices/tobi-e2.webp",
          width: 994,
          height: 694,
        },
        { name: "RootGlass (smart glasses)", src: "/devices/rootglass.jpg", width: 1258, height: 998 },
        { name: "RootCap (cap-mounted camera)", src: "/devices/rootcap.jpg", width: 3600, height: 2196 },
      ],
      equipmentNoticeTitle: "Notes",
      equipmentNotice: "The equipment may only be used for filming. Please contact us if it is lost, malfunctions, or is damaged. The workplace is not responsible for wear or deterioration caused by ordinary use. RootLens and the workplace will discuss responsibility for loss or damage caused intentionally or by gross negligence. The equipment must be returned when the agreement ends or when RootLens requests its return.",
      useTitle: "Data purposes and restrictions",
      useBody: "Filming data is used only for AI and robotics research and development. Within this scope, RootLens stores, processes, and analyses the data and provides it to companies and research institutions in Japan and overseas. The same purpose restriction applies to recipients.",
      prohibitedLead: "Neither RootLens nor recipients may use the data for:",
      prohibited: [
        "Identifying or tracking recorded people",
        "Publication as advertising or entertainment content",
      ],
      outsourcingBody: "RootLens may engage contractors to process or analyse filming data. The same restrictions apply to those contractors, and RootLens manages and supervises their work. We disclose the contractor's name and scope of work when requested by the participating workplace.",
      feeTitle: "Filming fee",
      feeBody: [
        "The filming fee is calculated from the duration of data accepted by a buyer and the conditions agreed in advance. No filming fee is payable for data a buyer does not accept.",
        "Acceptance criteria vary by buyer, but the main criterion is that the hands and objects are sufficiently visible in frame.",
        "We close payment at the end of the month in which RootLens receives payment from the buyer and pay the workplace by the end of the following month. RootLens pays the bank transfer fee.",
        "The calculation method is agreed separately with each participating workplace.",
        "If data provided to a buyer before the agreement ends is accepted after it ends, the filming fee is still paid under the same conditions.",
      ],
      controlTitle: "Review, withdrawal, and deletion",
      controls: [
        {
          title: "Review before provision",
          body: [
            "After filming, a site supervisor reviews the video and audio and approves only data that may be provided. Approval is completed in an application supplied by RootLens after connecting the capture device to a PC. RootLens provides only approved data to buyers.",
            "Approved data is anonymised. This includes masking people captured unintentionally, licence plates, name tags, and documents. During the initial review, please select only footage that may be provided.",
            "We do not provide data to a buyer for seven days after anonymisation is complete. The workplace can review the processed data during this period.",
          ],
        },
        {
          title: "Stopping participation",
          body: ["The workplace and each participant may stop participating at any time without giving a reason. Either the workplace or a participant may also end the agreement by informing RootLens."],
        },
        {
          title: "Deletion",
          body: [
            "At the request of the workplace or participant, RootLens deletes data that has not yet been provided to a buyer. We also promptly delete unprovided data when the agreement ends.",
            "If we receive a deletion request for data already provided to a buyer, we ask the buyer to stop using and delete it. We may not be able to recover or delete every copy. If the data has already been used to train an AI system, its effect cannot be removed from the trained result.",
          ],
        },
      ],
    },
    buy: {
      label: "For R&D and data procurement",
      title: "First-person data from real workplaces.",
      overviewTitle: "Overview",
      overview: [
        "Based in Japan, we collect first-person data across food service, retail, manufacturing, renovation, and other workplaces. We are currently expanding our network of participating sites, with an initial focus on food service.",
        "We use multiple capture devices in live data collection while continuing to select and improve them. We evaluate their effect on ordinary work, the physical burden on the wearer, and the quality of the resulting egocentric data as we improve the collection setup.",
      ],
      designTitle: "Collection design",
      designBody: "Target work, collection time, sensor configuration, and delivery format can be designed around research goals and model requirements. We can also provide selected ranges or annotated data when required.",
      provenanceTitle: "Data provenance",
      provenanceBody: "Each delivery is linked to the participating workplace's prior agreement, staff prior-consent records, and the site supervisor's approval. These records remain traceable from the delivered data.",
      provenanceAction: "Read the data policy",
      previewTitle: "Data preview",
      contactTitle: "Contact",
      contactBody: "Tell us the target work, hours, device, delivery format, and preferred timing. We will respond with feasibility and an indicative estimate.",
      contactAction: "Discuss requirements",
    },
    policy: {
      label: "Data policy",
      summary: "RootLens provides filming data obtained from participating workplaces to companies and research institutions conducting AI and robotics research and development (referred to below as buyers). Data passes through three stages before reaching a buyer.",
      steps: [
        { title: "01 Consent before filming", short: "We obtain an agreement with the workplace and individual consent from staff before filming begins." },
        { title: "02 Review and approval before provision", short: "Only data reviewed and approved by the workplace moves into the provision process." },
        { title: "03 Evidence management", short: "Identifiers link the data to each consent and approval record." },
      ],
      agreementTitle: "01 Consent before filming",
      agreementBody: [
        "Two forms of consent are required to collect filming data: an agreement with the business that manages the filming location (the participating workplace) and individual consent from staff.",
        "The agreement with the workplace is recorded in a workplace agreement. Individual consent is obtained from staff who wear the capture device and staff who may appear in the recording.",
      ],
      siteDoc: ["Workplace agreement", "An agreement between RootLens and the business that manages the filming location. It defines the scope of filming, permitted uses and restrictions, filming cooperation fees, approval before data provision, procedures for stopping and deletion, equipment lending and return, and confidentiality."],
      staffDoc: ["Filming participation consent", "A consent form reviewed and signed by people who wear the capture device or may appear in a recording. It explains the recorded data, permitted purposes, provision to companies and research institutions in and outside Japan, how to stop participating, deletion requests, and the limits that apply after data has already been provided."],
      documentsAction: "Request the full documents",
      approvalTitle: "02 Review and approval before provision",
      approvalBody: [
        "A site supervisor at the participating workplace reviews all recorded data and approves only data that may be provided. Approval takes place in an application supplied by RootLens.",
        "Unapproved data is never sent automatically from the capture device. Only approved data is uploaded and moves into the subsequent process.",
      ],
      appTitle: "RootLens Importer",
      appBody: "This desktop application connects to the capture device to import recordings, review video and audio, and upload approved data. At the start of filming, each workplace receives a dedicated authentication file used for the initial login.",
      appAction: "Download the app",
      evidenceTitle: "03 Evidence management",
      evidenceLead: "Each recording receives an identifier calculated from its contents and is linked to the following records.",
      evidenceFields: ["The workplace's prior agreement", "Staff prior-consent records", "The site supervisor's approval record", "The version number of each document"],
      evidenceBody: "We keep these records traceable from the data provided to a buyer.",
      processingTitle: "Processing after approval",
      processingAndLimitsTitle: "Processing after approval and purpose restrictions",
      processingBody: [
        "Approved data is masked to cover the faces of people captured unintentionally, licence plates, name tags, documents, and similar information.",
        "Provision to a buyer begins after a seven-day review period following completion of this processing. If an issue is found during this period, the data can be withdrawn.",
      ],
      limitsTitle: "Prohibited uses",
      limitsLead: "Filming data may be used only for AI and robotics research and development. RootLens, buyers, contractors, and participating workplaces may not use it for the following purposes.",
      limits: ["Identifying or tracking recorded people", "Publication as advertising or entertainment content"],
    },
  },
} as const;
