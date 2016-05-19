React = require 'react'
ReactDOM = require 'react-dom'
ReactCSSTransitionGroup = require 'react-addons-css-transition-group'
OnboardingActions = require './onboarding-actions'
PageRouterStore = require './page-router-store'

WelcomePage = require './welcome-page'
AccountChoosePage = require './account-choose-page'
AccountSettingsPage = require './account-settings-page'
InitialPreferencesPage = require './initial-preferences-page'

class PageRouter extends React.Component
  @displayName: 'PageRouter'
  @containerRequired: false

  constructor: (@props) ->
    @state = @_getStateFromStore()

  _getStateFromStore: =>
    page: PageRouterStore.page()
    pageData: PageRouterStore.pageData()

  componentDidMount: =>
    @unsubscribe = PageRouterStore.listen(@_onStateChanged, @)
    NylasEnv.center()
    NylasEnv.displayWindow()

  _onStateChanged: =>
    @setState(@_getStateFromStore())

  componentWillUnmount: =>
    @_unmounted = true
    @unsubscribe?()

  render: =>
    <div className="page-frame">
      {@_renderDragRegion()}
      <ReactCSSTransitionGroup
        transitionName="alpha-fade"
        transitionLeaveTimeout={150}
        transitionEnterTimeout={150}>
        {@_renderCurrentPage()}
        {@_renderCurrentPageGradient()}
      </ReactCSSTransitionGroup>
      <div className="page-background" style={background: "#f6f7f8"}/>
    </div>

  _renderCurrentPageGradient: =>
    gradient = @state.pageData?.provider?.color
    if gradient
      background = "linear-gradient(to top, #f6f7f8, #{gradient})"
      height = 200
    else
      background = "linear-gradient(to top, #f6f7f8 0%,  rgba(255,255,255,0) 100%), linear-gradient(to right, #E7EBAE 0%, #C1DFBC 50%, #AED7D7 100%)"
      height = 330
    <div className="page-gradient" key={"#{@state.page}-gradient"} style={background: background, height: height}/>

  _renderCurrentPage: =>
    Component = {
      "welcome": WelcomePage
      "account-choose": AccountChoosePage
      "account-settings": AccountSettingsPage
      "initial-preferences": InitialPreferencesPage
    }[@state.page]

    <div key={@state.page} className="page-container">
      <Component pageData={@state.pageData} ref="activePage" />
    </div>

  _renderDragRegion: ->
    styles =
      top:0
      left: 26
      right:0
      height: 27
      zIndex:100
      position: 'absolute'
      "WebkitAppRegion": "drag"
    <div className="dragRegion" style={styles}></div>

module.exports = PageRouter
