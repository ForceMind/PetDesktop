import Cocoa

private enum DialogueLanguage: Int {
    case chinese
    case english
    case mixed
}

private enum ClickRegion {
    case head, faceLeft, faceRight, leftPaw, body, rightPaw, feet
}

private struct PetMotion {
    var dx: CGFloat = 0
    var dy: CGFloat = 0
    var scaleX: CGFloat = 1
    var scaleY: CGFloat = 1
    var rotation: CGFloat = 0
}

private final class PetView: NSView {
    private let idleImage: NSImage
    private let idleFollowFrames: [NSImage]
    private let idleLifeFrames: [NSImage]
    private let actionFramesA: [NSImage]
    private let actionFramesB: [NSImage]
    private var animationTimer: Timer?
    private var actionIndex: Int?
    private var actionStarted = Date.timeIntervalSinceReferenceDate
    private var speech: String?
    private var language: DialogueLanguage = .chinese
    private var petHeight: CGFloat = 300
    private var mouseDownScreenPoint = NSPoint.zero
    private var mouseDownWindowOrigin = NSPoint.zero
    private var didDrag = false
    private var mouseIsDown = false
    private let idleStarted = Date.timeIntervalSinceReferenceDate
    private var idleGestureStarted = Date.timeIntervalSinceReferenceDate
    private var nextIdleGestureAt = Date.timeIntervalSinceReferenceDate + 2.4
    private var idleGesturePair = 0
    private var idleGestureActive = false

    private let padding: CGFloat = 20
    private let bubbleGap: CGFloat = 14
    private let bubbleMaximumTextWidth: CGFloat = 276

    private let durations: [TimeInterval] = [
        0.90, 0.78, 0.82, 0.92, 0.88, 1.00, 1.05, 1.05,
        0.92, 0.92, 1.05, 0.96, 0.90, 0.92, 0.92, 1.15,
        0.78, 1.00, 0.95, 1.05, 1.15, 1.18, 1.10, 1.05,
        1.10, 1.15, 1.08, 1.20, 0.92, 1.05, 0.92, 1.30
    ]

    private let chineseLines = [
        "起飞！今天也要跳得高高的～", "啪叽一下，我还能弹回来！", "抖一抖，烦恼全甩掉。", "弹弹弹，心情也变轻啦！",
        "嗯嗯，你说得很有道理。", "跟着节奏摇摆一下～", "看我的顺时针小旋风！", "反方向也完全没问题。",
        "向左探索一小步。", "右边是不是藏着零食？", "轻轻地，别吵醒桌面。", "伸个懒腰，满格出发！",
        "缩成一小团，省点能量。", "左边有什么？让我看看。", "右边也要认真检查。", "走一个漂亮的八字路线！",
        "能量过载，嗡嗡嗡！", "今天的我也很神气。", "谢谢你的陪伴，请多关照！", "偷偷探头——发现你啦！",
        "后空翻，稳稳落地！", "前空翻也要有始有终。", "音乐在哪里？Dance time！", "月球步启动，smooth～",
        "扑通扑通，是开心的声音。", "转晕了，让星星休息一下。", "嘘，我正在秘密行动。", "蓄力完成，准备冲呀！",
        "轻飘飘，像一朵小云。", "咚！桌面震感测试完成。", "哈哈哈，今天真有趣！", "先眯一会儿，待会见……"
    ]

    private let englishLines = [
        "Up we go!", "Squish, bounce, and back again!", "Shake the worries away!", "Boing! That feels wonderful!",
        "Yes, I completely agree.", "Sway with the rhythm.", "Here comes a tiny whirlwind!", "Reverse spin, perfectly done!",
        "One curious step to the left.", "Could there be snacks on the right?", "Quiet little tiptoes.", "A good stretch fixes everything!",
        "Tiny mode activated.", "Let me peek over here.", "Now let me check the other side.", "A perfect figure eight!",
        "Too much energy to stay still!", "Looking rather splendid today.", "Thank you for being here.", "Peekaboo! I found you!",
        "Backflip and a clean landing!", "Forward flip, safely home!", "The dance floor is wherever I am.", "Moonwalk mode activated.",
        "That is a happy heartbeat.", "A little dizzy, still adorable.", "Shh, this is a secret mission.", "Fully charged and ready to go!",
        "Floating like a tiny cloud.", "Stomp test complete!", "That was genuinely funny!", "A short nap, then more adventures."
    ]

    private let chineseExtras = [
        "今天也要可可爱爱！", "你一点击，我就充满能量。", "桌面巡逻一切正常～", "Nice！今天状态满分。",
        "Hello，我一直都在。", "休息一下，再继续加油！", "有你陪着，普通的一天也很特别。"
    ]

    private let englishExtras = [
        "I am right here with you.", "Desktop patrol is going perfectly.", "A tiny break can restore big energy.",
        "You clicked, so I am delighted!", "Today is an excellent day to be adorable."
    ]

    override var isFlipped: Bool { true }
    override var acceptsFirstResponder: Bool { true }

    init(frame: NSRect, idleImage: NSImage, idleFollow: [NSImage], idleLife: [NSImage],
         framesA: [NSImage], framesB: [NSImage]) {
        self.idleImage = idleImage
        self.idleFollowFrames = idleFollow
        self.idleLifeFrames = idleLife
        self.actionFramesA = framesA
        self.actionFramesB = framesB
        super.init(frame: frame)
        wantsLayer = true
        layer?.backgroundColor = NSColor.clear.cgColor
        startTimer()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    deinit {
        animationTimer?.invalidate()
    }

    var preferredContentSize: NSSize {
        contentSize(for: speech)
    }

    private func startTimer() {
        let timer = Timer(timeInterval: 1.0 / 60.0,
                          target: self,
                          selector: #selector(animationTick),
                          userInfo: nil,
                          repeats: true)
        RunLoop.main.add(timer, forMode: .common)
        animationTimer = timer
    }

    @objc private func animationTick() {
        let now = Date.timeIntervalSinceReferenceDate
        if let index = actionIndex, actionProgress(for: index) >= 1 {
            performLayoutChange {
                actionIndex = nil
                speech = nil
                nextIdleGestureAt = now + Double.random(in: 0.7...1.6)
            }
        }
        if actionIndex == nil { updateIdleGesture(now: now) }
        needsDisplay = true
    }

    private func updateIdleGesture(now: TimeInterval) {
        if mouseIsDown { return }
        if idleGestureActive {
            if now - idleGestureStarted >= 1.8 {
                idleGestureActive = false
                nextIdleGestureAt = now + Double.random(in: 2.2...5.2)
            }
        } else if now >= nextIdleGestureAt {
            idleGesturePair = Int.random(in: 0..<4)
            idleGestureStarted = now
            idleGestureActive = true
        }
    }

    private func actionProgress(for index: Int) -> CGFloat {
        let elapsed = Date.timeIntervalSinceReferenceDate - actionStarted
        return CGFloat(min(1, max(0, elapsed / durations[index])))
    }

    private func smoothStep(_ value: CGFloat) -> CGFloat {
        let x = min(1, max(0, value))
        return x * x * (3 - 2 * x)
    }

    private func poseOpacity(_ progress: CGFloat) -> CGFloat {
        if progress < 0.10 { return smoothStep(progress / 0.10) }
        if progress > 0.90 { return smoothStep((1 - progress) / 0.10) }
        return 1
    }

    private func secondFrameOpacity(_ progress: CGFloat) -> CGFloat {
        if progress < 0.36 { return 0 }
        if progress < 0.48 { return smoothStep((progress - 0.36) / 0.12) }
        if progress < 0.70 { return 1 }
        if progress < 0.82 { return smoothStep((0.82 - progress) / 0.12) }
        return 0
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        NSColor.clear.setFill()
        dirtyRect.fill()

        let petRect = petCanvasRect(for: speech)
        let progress: CGFloat
        let motion: PetMotion
        let poseAlpha: CGFloat
        if let index = actionIndex {
            progress = actionProgress(for: index)
            motion = motionForAction(index, progress: progress)
            poseAlpha = poseOpacity(progress)
        } else {
            progress = 0
            motion = idleMotion()
            poseAlpha = 0
        }

        guard let context = NSGraphicsContext.current else { return }
        context.saveGraphicsState()
        let transform = NSAffineTransform()
        transform.translateX(by: petRect.midX + motion.dx, yBy: petRect.midY + motion.dy)
        transform.rotate(byDegrees: motion.rotation)
        transform.scaleX(by: motion.scaleX, yBy: motion.scaleY)
        transform.concat()

        drawIdleLayers(fraction: 1 - poseAlpha)
        if let index = actionIndex, poseAlpha > 0 {
            let secondAlpha = secondFrameOpacity(progress)
            drawAction(actionFramesA[index], fraction: poseAlpha * (1 - secondAlpha))
            drawAction(actionFramesB[index], fraction: poseAlpha * secondAlpha)
        }
        context.restoreGraphicsState()

        if let speech {
            drawSpeechBubble(speech)
        }
    }

    private func drawIdleLayers(fraction: CGFloat) {
        guard fraction > 0 else { return }
        guard idleFollowFrames.count >= 8, idleLifeFrames.count >= 8 else {
            let aspect = idleImage.size.width / max(1, idleImage.size.height)
            let rect = NSRect(x: -(petHeight * aspect) / 2,
                              y: -petHeight / 2,
                              width: petHeight * aspect,
                              height: petHeight)
            idleImage.draw(in: rect, from: .zero, operation: .sourceOver,
                           fraction: fraction, respectFlipped: true, hints: nil)
            return
        }

        let gesture = idleGestureOpacity()
        drawIdleSquare(idleFollowFrames[followFrameIndex()],
                       fraction: fraction * (1 - gesture.opacity))
        if gesture.opacity > 0 {
            let first = idleGesturePair * 2
            drawIdleSquare(idleLifeFrames[first],
                           fraction: fraction * gesture.opacity * (1 - gesture.secondFrame))
            drawIdleSquare(idleLifeFrames[first + 1],
                           fraction: fraction * gesture.opacity * gesture.secondFrame)
        }
    }

    private func drawIdleSquare(_ image: NSImage, fraction: CGFloat) {
        guard fraction > 0 else { return }
        let side = petHeight * 1.10
        let rect = NSRect(x: -side / 2, y: -side / 2, width: side, height: side)
        image.draw(in: rect, from: .zero, operation: .sourceOver,
                   fraction: fraction, respectFlipped: true, hints: nil)
    }

    private func followFrameIndex() -> Int {
        guard let window else { return 0 }
        let petRect = petCanvasRect(for: speech)
        let headScreen = NSPoint(x: window.frame.minX + petRect.midX,
                                 y: window.frame.maxY - (petRect.minY + petRect.height * 0.34))
        let cursor = NSEvent.mouseLocation
        let dx = (cursor.x - headScreen.x) / max(1, petRect.width * 0.62)
        let dy = (cursor.y - headScreen.y) / max(1, petRect.height)
        let absX = abs(dx)
        let absY = abs(dy)

        if absX < 0.16 && absY < 0.13 {
            let blinkPhase = (Date.timeIntervalSinceReferenceDate - idleStarted)
                .truncatingRemainder(dividingBy: 4.2)
            return blinkPhase < 0.17 ? 1 : 0
        }
        if absX > absY * 0.82 {
            if absX < 0.55 && absY < 0.30 { return dx < 0 ? 6 : 7 }
            return dx < 0 ? 2 : 3
        }
        return dy > 0 ? 4 : 5
    }

    private func idleGestureOpacity() -> (opacity: CGFloat, secondFrame: CGFloat) {
        guard idleGestureActive else { return (0, 0) }
        let raw = (Date.timeIntervalSinceReferenceDate - idleGestureStarted) / 1.8
        let t = CGFloat(min(1, max(0, raw)))
        let opacity: CGFloat
        if t < 0.12 { opacity = smoothStep(t / 0.12) }
        else if t > 0.88 { opacity = smoothStep((1 - t) / 0.12) }
        else { opacity = 1 }

        let second: CGFloat
        if t < 0.25 { second = 0 }
        else if t < 0.45 { second = smoothStep((t - 0.25) / 0.20) }
        else if t < 0.64 { second = 1 }
        else if t < 0.84 { second = smoothStep((0.84 - t) / 0.20) }
        else { second = 0 }
        return (opacity, second)
    }

    private func idleMotion() -> PetMotion {
        let seconds = Date.timeIntervalSinceReferenceDate - idleStarted
        let breath = CGFloat(sin(seconds * Double.pi * 2 / 2.8))
        let sway = CGFloat(sin(seconds * Double.pi * 2 / 6.4))
        return PetMotion(dx: 0, dy: -1.8 - breath * 1.8,
                         scaleX: 1 - breath * 0.006,
                         scaleY: 1 + breath * 0.012,
                         rotation: sway * 0.8)
    }

    private func drawAction(_ image: NSImage, fraction: CGFloat) {
        let side = petHeight * 1.10
        let rect = NSRect(x: -side / 2, y: -side / 2, width: side, height: side)
        image.draw(in: rect, from: .zero, operation: .sourceOver,
                   fraction: fraction, respectFlipped: true, hints: nil)
    }

    private func sine(_ value: CGFloat) -> CGFloat {
        CGFloat(sin(Double(value)))
    }

    private func motionForAction(_ index: Int, progress t: CGFloat) -> PetMotion {
        let pi = CGFloat.pi
        let envelope = sine(pi * t)
        let cycle = 2 * pi * t
        var m = PetMotion()

        switch index {
        case 0:  m.dy = -abs(sine(pi * t)) * 92
        case 1:  m.scaleX = 1 + 0.28 * envelope; m.scaleY = 1 - 0.38 * envelope; m.dy = 26 * envelope
        case 2:  m.dx = sine(12 * pi * t) * 16 * envelope; m.rotation = sine(12 * pi * t) * 4 * envelope
        case 3:  m.dy = -abs(sine(3 * pi * t)) * 52 * envelope
        case 4:  m.rotation = sine(4 * pi * t) * 12 * envelope; m.dy = 8 * abs(sine(4 * pi * t)) * envelope
        case 5:  m.dx = sine(3 * cycle) * 27 * envelope; m.rotation = sine(3 * cycle) * 9 * envelope
        case 6:  m.rotation = 360 * t
        case 7:  m.rotation = -360 * t
        case 8:  m.dx = -50 * envelope; m.dy = -abs(sine(2 * pi * t)) * 34
        case 9:  m.dx = 50 * envelope; m.dy = -abs(sine(2 * pi * t)) * 34
        case 10: m.dx = sine(6 * pi * t) * 22 * envelope; m.dy = -abs(sine(6 * pi * t)) * 10
        case 11: m.scaleY = 1 + 0.34 * envelope; m.scaleX = 1 - 0.12 * envelope; m.dy = -20 * envelope
        case 12: m.scaleX = 1 - 0.28 * envelope; m.scaleY = 1 - 0.28 * envelope; m.dy = 36 * envelope
        case 13: m.dx = -48 * envelope; m.rotation = -13 * envelope
        case 14: m.dx = 48 * envelope; m.rotation = 13 * envelope
        case 15: m.dx = sine(cycle) * 52; m.dy = -sine(2 * cycle) * 24
        case 16: m.dx = sine(18 * pi * t) * 7 * envelope; m.dy = sine(14 * pi * t) * 4 * envelope
        case 17: m.scaleX = 1 + 0.11 * envelope; m.scaleY = 1 + 0.16 * envelope; m.dy = -12 * envelope
        case 18: m.rotation = 22 * envelope; m.dy = 12 * envelope
        case 19: m.scaleX = 0.96 + 0.10 * envelope; m.dx = -20 * envelope; m.rotation = -9 * envelope
        case 20: m.rotation = -360 * t; m.dy = -72 * abs(sine(pi * t))
        case 21: m.rotation = 360 * t; m.dy = -68 * abs(sine(pi * t))
        case 22: m.dx = sine(6 * pi * t) * 25 * envelope; m.dy = -abs(sine(6 * pi * t)) * 24; m.rotation = sine(4 * pi * t) * 10 * envelope
        case 23: m.dx = -58 * envelope; m.dy = sine(8 * pi * t) * 5 * envelope
        case 24: let beat = abs(sine(6 * pi * t)) * envelope; m.scaleX = 1 + 0.18 * beat; m.scaleY = 1 + 0.18 * beat
        case 25: m.rotation = sine(7 * pi * t) * 25 * envelope; m.dx = sine(5 * pi * t) * 18 * envelope
        case 26: m.dx = sine(4 * pi * t) * 35 * envelope; m.scaleY = 0.92 + 0.08 * (1 - envelope)
        case 27: m.dx = 72 * envelope; m.scaleX = 1 + 0.22 * envelope; m.scaleY = 1 - 0.10 * envelope
        case 28: m.dy = -44 * envelope; m.dx = sine(4 * pi * t) * 10 * envelope; m.rotation = sine(2 * pi * t) * 7 * envelope
        case 29: m.dy = 30 * abs(sine(2 * pi * t)) * envelope; m.scaleY = 1 - 0.20 * abs(sine(2 * pi * t)) * envelope
        case 30: m.rotation = sine(8 * pi * t) * 11 * envelope; m.scaleX = 1 + 0.10 * abs(sine(8 * pi * t)) * envelope
        case 31: m.dy = 14 * envelope; m.rotation = sine(2 * pi * t) * 7 * envelope; m.scaleY = 1 - 0.10 * envelope
        default: break
        }
        return m
    }

    private var textAttributes: [NSAttributedString.Key: Any] {
        [
            .font: NSFont.systemFont(ofSize: 17, weight: .medium),
            .foregroundColor: NSColor(calibratedWhite: 0.13, alpha: 1)
        ]
    }

    private func measuredBubbleSize(for text: String?) -> NSSize {
        guard let text, !text.isEmpty else { return .zero }
        let textRect = (text as NSString).boundingRect(
            with: NSSize(width: bubbleMaximumTextWidth,
                         height: CGFloat.greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: textAttributes)
        let width = min(bubbleMaximumTextWidth + 32, max(180, ceil(textRect.width) + 32))
        let height = max(72, ceil(textRect.height) + 30)
        return NSSize(width: width, height: height)
    }

    private func contentSize(for text: String?) -> NSSize {
        let petSide = petHeight * 1.10
        let bubbleSize = measuredBubbleSize(for: text)
        let extraWidth = bubbleSize.width > 0 ? bubbleSize.width + bubbleGap : 0
        return NSSize(width: petSide + padding * 2 + extraWidth,
                      height: max(petSide + padding * 2, bubbleSize.height + padding * 2))
    }

    private func petCanvasRect(for text: String?) -> NSRect {
        let size = contentSize(for: text)
        let side = petHeight * 1.10
        let bubbleSize = measuredBubbleSize(for: text)
        let extraWidth = bubbleSize.width > 0 ? bubbleSize.width + bubbleGap : 0
        return NSRect(x: padding + extraWidth,
                      y: (size.height - side) / 2,
                      width: side,
                      height: side)
    }

    private func bubbleRect(for text: String) -> NSRect {
        let size = measuredBubbleSize(for: text)
        return NSRect(x: padding,
                      y: (bounds.height - size.height) / 2,
                      width: size.width,
                      height: size.height)
    }

    private func drawSpeechBubble(_ text: String) {
        let bubble = bubbleRect(for: text)
        let path = NSBezierPath(roundedRect: bubble, xRadius: 18, yRadius: 18)
        NSColor(calibratedWhite: 1, alpha: 0.97).setFill()
        path.fill()
        NSColor(calibratedRed: 0.20, green: 0.16, blue: 0.13, alpha: 0.88).setStroke()
        path.lineWidth = 2
        path.stroke()

        let tail = NSBezierPath()
        tail.move(to: NSPoint(x: bubble.maxX - 2, y: bubble.midY - 9))
        tail.line(to: NSPoint(x: bubble.maxX + 13, y: bubble.midY + 1))
        tail.line(to: NSPoint(x: bubble.maxX - 2, y: bubble.midY + 10))
        tail.close()
        NSColor(calibratedWhite: 1, alpha: 0.97).setFill()
        tail.fill()
        NSColor(calibratedRed: 0.20, green: 0.16, blue: 0.13, alpha: 0.88).setStroke()
        tail.lineWidth = 2
        tail.stroke()

        let textRect = bubble.insetBy(dx: 16, dy: 15)
        (text as NSString).draw(with: textRect,
                                options: [.usesLineFragmentOrigin, .usesFontLeading],
                                attributes: textAttributes)
    }

    private func pickDialogue(for index: Int) -> String {
        switch language {
        case .chinese:
            return Int.random(in: 0..<5) == 0
                ? chineseExtras.randomElement()!
                : chineseLines[index]
        case .english:
            return Int.random(in: 0..<4) == 0
                ? englishExtras.randomElement()!
                : englishLines[index]
        case .mixed:
            return Bool.random() ? chineseLines[index] : englishLines[index]
        }
    }

    private func clickRegion(at point: NSPoint) -> ClickRegion {
        let pet = petCanvasRect(for: speech)
        let x = min(1, max(0, (point.x - pet.minX) / max(1, pet.width)))
        let y = min(1, max(0, (point.y - pet.minY) / max(1, pet.height)))
        if y < 0.20 { return .head }
        if y < 0.46 { return x < 0.5 ? .faceLeft : .faceRight }
        if y < 0.76 {
            if x < 0.31 { return .leftPaw }
            if x > 0.69 { return .rightPaw }
            return .body
        }
        return .feet
    }

    private func actionForRegion(_ region: ClickRegion) -> Int {
        let choices: [Int]
        switch region {
        case .head: choices = [4, 17, 30, 27, 31]
        case .faceLeft: choices = [13, 2, 24, 5]
        case .faceRight: choices = [14, 7, 29, 23]
        case .leftPaw: choices = [8, 18, 21, 22]
        case .rightPaw: choices = [9, 26, 6, 15]
        case .feet: choices = [0, 3, 28, 10, 19, 20]
        case .body: choices = [1, 23, 29, 12, 16, 25, 11]
        }
        return choices.randomElement()!
    }

    private func regionDialogue(_ region: ClickRegion) -> String {
        let english = language == .english || (language == .mixed && Bool.random())
        switch region {
        case .head: return english ? "Careful with my blue feathers!" : "摸摸头，羽毛可别弄乱啦～"
        case .faceLeft: return english ? "That cheek is ticklish!" : "左脸有一点怕痒！"
        case .faceRight: return english ? "You found my playful side!" : "右边被你发现啦！"
        case .leftPaw: return english ? "Left-paw high five!" : "左手击掌，High five！"
        case .rightPaw: return english ? "Right paw ready!" : "右手已经准备好啦！"
        case .feet: return english ? "My feet want to jump!" : "脚底痒痒，要跳起来啦！"
        case .body: return english ? "My belly is very ticklish!" : "哈哈，肚皮最怕痒了！"
        }
    }

    private func triggerAction(at point: NSPoint) {
        let region = clickRegion(at: point)
        let index = actionForRegion(region)
        performLayoutChange {
            actionIndex = index
            actionStarted = Date.timeIntervalSinceReferenceDate
            idleGestureActive = false
            speech = Int.random(in: 0..<3) == 0 ? regionDialogue(region) : pickDialogue(for: index)
        }
        needsDisplay = true
    }

    private func performLayoutChange(_ mutation: () -> Void) {
        guard let window else {
            mutation()
            frame.size = preferredContentSize
            return
        }

        let oldPetRect = petCanvasRect(for: speech)
        let screenPetCenter = NSPoint(x: window.frame.minX + oldPetRect.midX,
                                      y: window.frame.maxY - oldPetRect.midY)
        mutation()
        let newSize = contentSize(for: speech)
        let newPetRect = petCanvasRect(for: speech)
        window.setContentSize(newSize)
        var newOrigin = NSPoint(x: screenPetCenter.x - newPetRect.midX,
                                y: screenPetCenter.y + newPetRect.midY - newSize.height)

        if let visible = window.screen?.visibleFrame ?? NSScreen.main?.visibleFrame {
            newOrigin.x = min(max(newOrigin.x, visible.minX), visible.maxX - newSize.width)
            newOrigin.y = min(max(newOrigin.y, visible.minY), visible.maxY - newSize.height)
        }
        window.setFrameOrigin(newOrigin)
    }

    private func setPetHeight(_ height: CGFloat) {
        performLayoutChange {
            petHeight = min(520, max(120, height))
        }
        needsDisplay = true
    }

    override func mouseDown(with event: NSEvent) {
        mouseDownScreenPoint = NSEvent.mouseLocation
        mouseDownWindowOrigin = window?.frame.origin ?? .zero
        didDrag = false
        mouseIsDown = true
    }

    override func mouseDragged(with event: NSEvent) {
        guard let window else { return }
        let current = NSEvent.mouseLocation
        let dx = current.x - mouseDownScreenPoint.x
        let dy = current.y - mouseDownScreenPoint.y
        if abs(dx) + abs(dy) > 3 { didDrag = true }
        window.setFrameOrigin(NSPoint(x: mouseDownWindowOrigin.x + dx,
                                      y: mouseDownWindowOrigin.y + dy))
    }

    override func mouseUp(with event: NSEvent) {
        mouseIsDown = false
        if !didDrag {
            let point = convert(event.locationInWindow, from: nil)
            if petCanvasRect(for: speech).contains(point) {
                triggerAction(at: point)
            }
        }
    }

    override func scrollWheel(with event: NSEvent) {
        let step: CGFloat = event.scrollingDeltaY > 0 ? 18 : -18
        setPetHeight(petHeight + step)
    }

    override func rightMouseDown(with event: NSEvent) {
        let menu = makeContextMenu()
        NSMenu.popUpContextMenu(menu, with: event, for: self)
    }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    private func makeContextMenu() -> NSMenu {
        let menu = NSMenu(title: "Coco")

        let sizeItem = NSMenuItem(title: localized("调整大小", "Size"), action: nil, keyEquivalent: "")
        let sizeMenu = NSMenu(title: sizeItem.title)
        for (title, height) in [("60%", 180), ("80%", 240), ("100%", 300), ("125%", 375), ("150%", 450)] {
            let item = NSMenuItem(title: title, action: #selector(changeSize(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = NSNumber(value: height)
            if abs(petHeight - CGFloat(height)) < 2 { item.state = .on }
            sizeMenu.addItem(item)
        }
        sizeItem.submenu = sizeMenu
        menu.addItem(sizeItem)

        let languageItem = NSMenuItem(title: localized("对白语言", "Dialogue Language"), action: nil, keyEquivalent: "")
        let languageMenu = NSMenu(title: languageItem.title)
        let languageChoices: [(String, String, DialogueLanguage)] = [
            ("中文（可混合简单 English）", "Chinese (light English)", .chinese),
            ("英文（纯 English）", "English only", .english),
            ("中英随机", "Chinese / English mix", .mixed)
        ]
        for choice in languageChoices {
            let item = NSMenuItem(title: localized(choice.0, choice.1),
                                  action: #selector(changeLanguage(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = NSNumber(value: choice.2.rawValue)
            item.state = language == choice.2 ? .on : .off
            languageMenu.addItem(item)
        }
        languageItem.submenu = languageMenu
        menu.addItem(languageItem)

        menu.addItem(.separator())
        let topmost = NSMenuItem(title: localized("始终置顶", "Always on Top"),
                                 action: #selector(toggleTopmost(_:)), keyEquivalent: "")
        topmost.target = self
        topmost.state = window?.level == .floating ? .on : .off
        menu.addItem(topmost)

        menu.addItem(.separator())
        let quit = NSMenuItem(title: localized("退出程序", "Quit"),
                              action: #selector(quitApplication(_:)), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)
        return menu
    }

    private func localized(_ chinese: String, _ english: String) -> String {
        language == .english ? english : chinese
    }

    @objc private func changeSize(_ sender: NSMenuItem) {
        guard let value = sender.representedObject as? NSNumber else { return }
        setPetHeight(CGFloat(value.doubleValue))
    }

    @objc private func changeLanguage(_ sender: NSMenuItem) {
        guard let value = sender.representedObject as? NSNumber,
              let selected = DialogueLanguage(rawValue: value.intValue) else { return }
        language = selected
    }

    @objc private func toggleTopmost(_ sender: NSMenuItem) {
        guard let window else { return }
        window.level = window.level == .floating ? .normal : .floating
    }

    @objc private func quitApplication(_ sender: NSMenuItem) {
        NSApplication.shared.terminate(nil)
    }
}

private final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApplication.shared.setActivationPolicy(.accessory)
        guard let resourceURL = Bundle.main.resourceURL,
              let idleImage = NSImage(contentsOf: resourceURL.appendingPathComponent("coco.png")) else {
            showFatalError("无法读取 Coco 图片资源。\nUnable to load Coco image resources.")
            return
        }

        var framesA: [NSImage] = []
        var framesB: [NSImage] = []
        var idleFollow: [NSImage] = []
        var idleLife: [NSImage] = []
        for number in 1...32 {
            let stem = String(format: "action_%02d", number)
            guard let imageA = NSImage(contentsOf: resourceURL.appendingPathComponent("\(stem).png")),
                  let imageB = NSImage(contentsOf: resourceURL.appendingPathComponent("\(stem)_b.png")) else {
                showFatalError("动作资源不完整：\(stem)\nMissing action resource: \(stem)")
                return
            }
            framesA.append(imageA)
            framesB.append(imageB)
        }

        for number in 1...8 {
            let suffix = String(format: "%02d", number)
            guard let follow = NSImage(contentsOf: resourceURL.appendingPathComponent("idle_follow_\(suffix).png")),
                  let life = NSImage(contentsOf: resourceURL.appendingPathComponent("idle_life_\(suffix).png")) else {
                showFatalError("待机资源不完整：\(suffix)\nMissing idle resource: \(suffix)")
                return
            }
            idleFollow.append(follow)
            idleLife.append(life)
        }

        let view = PetView(frame: .zero, idleImage: idleImage,
                           idleFollow: idleFollow, idleLife: idleLife,
                           framesA: framesA, framesB: framesB)
        let size = view.preferredContentSize
        let window = NSWindow(contentRect: NSRect(origin: .zero, size: size),
                              styleMask: [.borderless],
                              backing: .buffered,
                              defer: false)
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = false
        window.level = .floating
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.isReleasedWhenClosed = false
        window.contentView = view
        window.makeFirstResponder(view)

        if let visible = NSScreen.main?.visibleFrame {
            window.setFrameOrigin(NSPoint(x: visible.maxX - size.width - 24,
                                           y: visible.minY + 24))
        }
        window.orderFrontRegardless()
        self.window = window
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    private func showFatalError(_ message: String) {
        let alert = NSAlert()
        alert.messageText = "Coco 桌宠"
        alert.informativeText = message
        alert.alertStyle = .critical
        alert.runModal()
        NSApplication.shared.terminate(nil)
    }
}

let application = NSApplication.shared
let applicationDelegate = AppDelegate()
application.delegate = applicationDelegate
application.run()
