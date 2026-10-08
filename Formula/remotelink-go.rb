class RemotelinkGo < Formula
  desc "Controlled remote computer access for AI"
  homepage "https://remotearc.app"
  version "0.5.0"

  on_macos do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/go-agent-v0.5.0/remotelink-go-v0.5.0-darwin-arm64", using: :nounzip
      sha256 "5d5cb5c7a7ac0c96f9c05e250875fb51dfffd7bfb232a1e5e13c32e05b1e2696"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/go-agent-v0.5.0/remotelink-go-v0.5.0-darwin-amd64", using: :nounzip
      sha256 "b1fbe3361b6e10773cc9196c144e1bf20ab29a640756b736fa46434b4cf94d07"
    end
  end
  on_linux do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/go-agent-v0.5.0/remotelink-go-v0.5.0-linux-arm64", using: :nounzip
      sha256 "c880621940f7992529cc6cd0c2fa94bf8e240bf8c797e0d47c05881a1bbb66ab"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/go-agent-v0.5.0/remotelink-go-v0.5.0-linux-amd64", using: :nounzip
      sha256 "5ac7e2efaabeb4327e060c39bd4216a8a7777bb9ad9c42162b3352f2707d7add"
    end
  end

  def install
    bin.install Dir["remotelink-go-v*"].first => "remotelink"
    chmod 0755, bin/"remotelink"
  end

  test do
    assert_equal "0.5.0", shell_output("#{bin}/remotelink --version").strip
  end
end
