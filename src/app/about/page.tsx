import type { Metadata } from "next";
import { Copy, Download, Mic, PanelLeftOpen, Redo2, Undo2 } from "lucide-react";

export const metadata: Metadata = {
  title: "О проекте — Вакансия голосом",
  description: "Система создания вакансий"
};

const repository = "https://github.com/leninblok/lab-pii-voice-vacancy/blob/main/";

function ScreenActions() {
  return <div className="about-screen-demo__actions" aria-hidden="true">
    <PanelLeftOpen className="about-screen-demo__panel" size={18} strokeWidth={1.7} />
    <span />
    <Undo2 size={18} strokeWidth={1.7} />
    <Redo2 size={18} strokeWidth={1.7} />
    <Copy size={18} strokeWidth={1.7} />
    <Download className="about-screen-demo__download" size={18} strokeWidth={1.7} />
  </div>;
}

function StartScreenDemo() {
  return <figure className="about-start-demo">
    <div>
      <h2>Расскажите,<br />кого вы ищете?</h2>
      <p>Опишите будущую работу как получится. Редактор соберёт черновик и подскажет, что ещё уточнить</p>
      <div className="about-start-demo__input">Например, продуктового дизайнера <Mic size={18} strokeWidth={1.7} aria-hidden="true" /></div>
    </div>
  </figure>;
}

function FullScreenDemo() {
  return <figure className="about-screen-demo" aria-label="Экран редактора вакансии">
    <ScreenActions />
    <div className="about-screen-demo__document vacancy-editor">
      <h1 className="vacancy-editor__title">Ищем продуктового дизайнера</h1>
      <p className="vacancy-editor__paragraph about-screen-demo__intro">Ищем дизайнера в команду, которая развивает основной продукт</p>
      <section className="about-screen-demo__section">
        <h2 className="vacancy-editor__heading">Чем предстоит заниматься</h2>
        <ul className="vacancy-editor__list">
          <li>Проектировать пользовательские сценарии и интерфейсы</li>
          <li>Проверять решения вместе с командой</li>
          <li>Готовить материалы для разработки</li>
        </ul>
      </section>
    </div>
    <div className="about-screen-demo__composer">
      <div className="about-screen-demo__topics" aria-label="Прогресс разговора">
        <span className="is-ready">Задачи <b>✓</b><i /></span>
        <span className="is-ready">Проект <b>✓</b><i /></span>
        <span>Дальше<i /></span>
        <span>Навыки<i /></span>
      </div>
      <p>Что изменится в работе после первых шести месяцев?</p>
      <small>Например: какой следующий проект появится у человека</small>
      <div className="about-screen-demo__input"><span className="about-screen-demo__wave" aria-hidden="true">{Array.from({ length: 88 }, (_, index) => <i key={index} />)}</span><Mic size={18} strokeWidth={1.7} aria-hidden="true" /></div>
    </div>
  </figure>;
}

function ChangeDemo() {
  return <figure className="about-change-demo">
    <p>В первые шесть месяцев дизайнер <del>будет заниматься редизайном</del> <ins>обновит основной продукт и проверит решения с клиентами</ins></p>
  </figure>;
}

export default function AboutPage() {
  return <main className="about-report">
    <article className="about-report__copy">
      <h1>Система создания<br />вакансий</h1>
      <p className="about-report__lead">Я поставил в центр документ, а ИИ сделал инструментом работы с ним. Вакансия появляется сразу, остаётся готовой к копированию и экспорту, а разговор только дополняет её фактами</p>

      <h2>Стартовый экран</h2>
      <p>Работодатель начинает с того, что знает: называет роль или говорит о работе своими словами. Не нужно заполнять анкету и заранее думать о структуре текста</p>
    </article>

    <StartScreenDemo />

    <article className="about-report__copy">
      <h2>Документ в центре</h2>
      <p>После первого ответа появляется черновик вакансии. Он уже готов: его можно править, скопировать в HeadHunter, сохранить в PDF или отправить коллегам. Не нужно сначала пройти опрос, а потом получить текст — документ собирается с самого начала</p>
      <p>ИИ не ведёт пользователя по жёсткой форме. Он задаёт вопрос, но можно ответить на другую тему, рассказать то, что сейчас важнее, или переключиться между темами. Система разберёт ответ, обновит документ и пересчитает прогресс</p>
    </article>

    <FullScreenDemo />

    <article className="about-report__copy">
      <h2>Прогресс без анкеты</h2>
      <p>Сначала я пробовал круговой индикатор, но он создавал ощущение обязательного теста и ничего не говорил о содержании. Вместо него сделал четыре линии: задачи, ближайший проект, дальнейшая работа и навыки</p>
      <p>Линия заполняется, когда по теме уже хватает конкретики. Заполненные темы не исчезают: оранжевая линия и галочка показывают, что разговор продвинулся, но не превращают интерфейс в закрытую анкету. Если появилось важное дополнение, к любой теме можно вернуться через текст документа</p>

      <h2>Что меняет система</h2>
      <ChangeDemo />
      <p>Когда система уточняет вакансию, она меняет только нужный фрагмент. Новый текст некоторое время остаётся цветным, чтобы было видно изменение. Документ при этом остаётся обычным редактируемым текстом: его можно поправить без согласования с ИИ</p>

      <h2>Копирование и PDF</h2>
      <p>Кнопка копирования берёт описание без названия вакансии. Так его можно сразу вставить в поле описания на HeadHunter, а название оставить в отдельном поле. В буфер попадают и обычный текст, и HTML: заголовки и списки сохраняют структуру там, где редактор её поддерживает</p>
      <p>PDF печатается из той же HTML-вёрстки, что и редактор. Поэтому в файле сохраняются Inter, отступы и булиты, а в имени файла есть название вакансии и дата последней правки</p>

      <h2>История вакансий</h2>
      <p>Все созданные вакансии остаются в списке слева и сохраняются в браузере. После перезагрузки можно вернуться к последней вакансии или открыть другую. Для последних изменений есть отмена и повтор: ручная правка не пропадает, если система позже пересчитывает вопрос или прогресс</p>

      <h2>Приоритеты</h2>
      <p>Главный источник правды — слова работодателя и его ручные правки. ИИ помогает разобрать речь, собрать факты в структуру и подсказать следующий вопрос. Он не должен дописывать зарплату, опыт, инструменты или условия от себя. Если смысл неясен, лучше спросить, чем угадать</p>

      <h2>Что не успел</h2>
      <p>Хочу докрутить агента, который разбирает ответы, собирает документ и задаёт вопросы. Сейчас он не всегда достаточно точно отличает факт от догадки, связывает фразы в текст и выбирает полезное уточнение</p>

      <h2>Как я собирал проект</h2>
      <p>Сначала я обсудил с ChatGPT саму идею: что должно получиться, для кого это нужно и какую роль в этом занимает ИИ. Затем мы разложили решение на принципы, спецификацию, правила текста и план работ. Эти документы стали опорой для разработки, а не отчётом задним числом</p>
      <p>Дальше я собрал прототип в коде вместе с Codex. Подключал нужные навыки по ходу работы, смотрел на результат, отмечал, где интерфейс или текст не решает задачу, и сразу корректировал направление. Так проект рос короткими итерациями: идея, рабочий экран, проверка, следующий комментарий</p>
      <p>В Figma я один раз быстро набросал плашку ввода, чтобы сравнить варианты пропорций и передать направление в разработку. Остальные экраны не рисовал отдельно: собирал их сразу в коде и проверял в живом прототипе</p>

      <h2>Ссылки</h2>
      <ul className="about-report__list about-report__links about-report__links--primary">
        <li><a href="https://leonidmakarov-voice-vacancy.vercel.app/" target="_blank" rel="noreferrer">Прототип</a></li>
        <li><a href="https://github.com/leninblok/lab-pii-voice-vacancy" target="_blank" rel="noreferrer">Весь код на GitHub</a></li>
      </ul>
      <ul className="about-report__list about-report__links">
        <li><a href={`${repository}PRODUCT_PRINCIPLES.md`} target="_blank" rel="noreferrer">Принципы продукта</a></li>
        <li><a href={`${repository}SPEC.md`} target="_blank" rel="noreferrer">Спецификация</a></li>
        <li><a href={`${repository}EDITORIAL_GUIDELINES.md`} target="_blank" rel="noreferrer">Правила текста и типографики</a></li>
        <li><a href={`${repository}docs/PROJECT_HISTORY.md`} target="_blank" rel="noreferrer">История работы</a></li>
        <li><a href={`${repository}docs/QA.md`} target="_blank" rel="noreferrer">Проверки и ограничения</a></li>
      </ul>
    </article>
  </main>;
}
