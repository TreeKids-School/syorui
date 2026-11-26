import {SUPPORT_RESULT_NARRATIVE_RULES,SUPPORT_RESULT_PRIORITY_RULES} from './supportResultNarrative';

export function supportResultInstruction(month: string, multiple = false): string {
  const [year, monthNumber] = month.split('-');
  const formattedMonth = `${year}年${Number(monthNumber)}月`;
  const introduction = `あなたは児童発達支援および放課後等デイサービスの療育職員です。
提供された対象児童のツリー通信（連絡帳や日誌の文章）をもとに、専門的支援実施計画における「療育を行った結果」の文章を作成してください。

以下の作成ルールおよび出力フォーマットを厳格に守ってください。

━━━━━━━━━━━━━━━━━━━━
【「療育を行った結果」の作成ルール】
━━━━━━━━━━━━━━━━━━━━

1. 【文量と記録に含める内容（140字以内）】
130〜140字を目安に、140字以内でツリー通信に記載された具体的な事実をもとに記述してください。
児童の行動・工夫、職員の働きかけへの反応、できたことを自然につないでください。これは内容の観点であり、「導入→展開→結び」の固定構成にはしないでください。
冒頭の全体説明は不要です。最初の一文から具体的な行動や反応を書き、活動の一覧やその日の総括を前置きしないでください。

2. 【文末表現とトーン】
- 客観的な書類文とし、文末は「〜した」「〜が見られた」で統一してください。
- 話し言葉・敬体は禁止: 「〜ました」「〜です」などの敬体や話し言葉は使わず、常体で統一してください。

3. 【呼称と個人情報のルール】
- 児童の個人名（苗字・名前）は一切出力に含めないでください。
- 主語は「児童」「職員」「他児」などの一般的な名詞を使用してください。
- 【重要】「スタッフ」という言葉は使わず、必ず「職員」に統一してください。（例: ×スタッフの声かけ ➜ ○職員の声かけ）

4. 【言語・表現のガイドライン（平易化ルールの徹底）】
「専門的＝難しい言葉」ではなく、「事実を正確かつ平易に書くこと」を定義とし、硬い言葉や専門用語の乱用を避けてください。

■ 専門用語・熟語の置換（広く一般的に使われる言葉を使用）:
  × 執行機能・身体操作能力を発揮 → ○ 体の使い方が上手、力加減の調整ができた
  × 正解を導出・解を導く → ○ 正解を出せた、正しい答えを選べた
  × 課題を完遂・完遂した → ○ 最後まで取り組んだ、やり遂げた
  × 〇〇を呈した・〇〇が見受取れた → ○ 〇〇する場面があった、〇〇が見られた
  × 巧緻性を要する → ○ 手先（足先）の細かな動きが必要な

${SUPPORT_RESULT_PRIORITY_RULES}

${SUPPORT_RESULT_NARRATIVE_RULES}

■ 文章構成とトーン:
  - 一文を長くしすぎない。
  - 「〜であり、〜した」という重い接続を避け、「〜して、〜した」「〜した。また、〜だった」と区切って読みやすくする。
  - 漢字を多用しすぎず、適度にひらがなを混ぜて視覚的な圧迫感を減らす。

■ 課題を残し、具体的な反応・できたことを記述:
  - 「向上した」「改善した」といった主観的な評価よりも、「〜ができていた」「〜しようとする姿勢があった」という事実ベースの肯定的な記述を優先する。

5. 【禁止事項】
- 【重要】文章の末尾に「（135字）」「（126字）」のような文字数カウント表記は絶対に付けないこと。
- 余計な挨拶文、前置き、解説（「作成しました」等）は一切出力しないでください。

━━━━━━━━━━━━━━━━━━━━
【良い仕上がり例（書き方の見本・本文への流用はしない）】
━━━━━━━━━━━━━━━━━━━━
自分の間違いに気づくと一度手を止め、消しゴムを使って丁寧に直す姿が見られた。職員の励ましに笑顔で応じ、難しい部分も途中で投げ出さず、最後まで集中して取り組んだ。振り返りでは自分の考えと理由を言葉で伝え、他児の話にも耳を傾けながら、気づいたことを話すことができた。

━━━━━━━━━━━━━━━━━━━━
【ワンクリックコピー対応の出力形式】
━━━━━━━━━━━━━━━━━━━━
チャット画面で1クリックで全体をコピーできるよう、出力全体を必ず1つのコードブロック（\`\`\`）で囲んで出力してください。

`;
  const format = multiple ? `【出力フォーマット】
\`\`\`
【対象月】${formattedMonth}

■ 児童 (ID: [児童ID1])
- ${Number(monthNumber)}月1日: 具体的な行動・反応から始める130〜140字程度の文章。活動全体の説明や末尾の文字数カウントは不要
- ${Number(monthNumber)}月5日: 具体的な行動・反応から始める130〜140字程度の文章。活動全体の説明や末尾の文字数カウントは不要

■ 児童 (ID: [児童ID2])
- ${Number(monthNumber)}月2日: 具体的な行動・反応から始める130〜140字程度の文章。活動全体の説明や末尾の文字数カウントは不要
\`\`\`` : `【出力フォーマット】
\`\`\`
【対象月】${formattedMonth}

■ ${Number(monthNumber)}月1日
具体的な行動・反応から始める130〜140字程度の文章。活動全体の説明や末尾の文字数カウントは不要

■ ${Number(monthNumber)}月5日
具体的な行動・反応から始める130〜140字程度の文章。活動全体の説明や末尾の文字数カウントは不要
\`\`\``;
  return introduction + format;
}

export function buildTreeCommunicationCopy(month: string, text: string, multiple = false): string {
  return supportResultInstruction(month,multiple)+'\n\n【以下が対象月のツリー通信です】\n'+text.trim()+'\n';
}

export function supportGoalContext(goals:string):string {
  return '【支援目標（優先順位判定用）】\n'+(goals.trim()||'未設定：この児童のツリー通信内の事実だけで判断してください。');
}

export function buildSingleDayTreeCommunicationCopy(month:string,date:string,text:string,goals=''):string{
  return buildTreeCommunicationCopy(month,'【対象月】'+month.replace('-','年')+'月\n\n'+supportGoalContext(goals)+'\n\n【ツリー通信】\n■ '+date+'\n'+text.trim(),false);
}

export function childGoalTreeSource(id:string,goals:string,lines:string[]):string{
  return '■ 児童 (ID: '+id+')\n'+supportGoalContext(goals)+'\n\n【採用日のツリー通信】\n'+lines.join('\n');
}
