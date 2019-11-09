import * as React from "react";

// An empty array to return for referential equality
const EMPTY_ARRAY: Array<any> = [];

/**
 * Interface for the optional wrapper element for transition-group children
 *
 * @interface IWrapperElement
 */
interface IWrapperElement {
  /**
   * The tag: i.e. "span", "div", etc.
   *
   * @type {keyof JSX.IntrinsicElements}
   * @memberof IWrapperElement
   */
  Element: keyof JSX.IntrinsicElements;
  /**
   * An optional class to apply to the wrapper element.
   *
   * @type {string}
   * @memberof IWrapperElement
   */
  className?: string;
}

interface ITransitionGroupProps {
  /**
   * Children has to be either an array or a single child.
   *
   * @type {(Array<React.ReactElement | null>
   *     | React.ReactElement
   *     | undefined
   *     | null)}
   * @memberof ITransitionGroupProps
   */
  readonly children:
    | Array<React.ReactElement | null>
    | React.ReactElement
    | undefined
    | null;
  /**
   * The name of the transition, which will be prepended to the transition classes.
   *
   * @type {string}
   * @memberof ITransitionGroupProps
   */
  readonly transitionName: string;
  /**
   * The duration of the enter transition.
   *
   * @type {number}
   * @memberof ITransitionGroupProps
   */
  readonly transitionEnterTimeout: number;
  /**
   * The duration of the leave transition.
   *
   * @type {number}
   * @memberof ITransitionGroupProps
   */
  readonly transitionLeaveTimeout: number;
  /**
   * A className to apply to the containing element of the transition group containing element
   *
   * @type {string}
   * @memberof ITransitionGroupProps
   */
  readonly className?: string;
  /**
   * The component to use as the group's containing element. Can be `React.Fragment` for no
   * containing element. Defaults to `span`.
   *
   * @type {React.ElementType}
   * @memberof ITransitionGroupProps
   */
  readonly component?: React.ElementType;
  /**
   * An tag to wrap the children with and apply transition classes to, rather than trying to apply
   * them to the children themselves.
   *
   * @type {IWrapperElement}
   * @memberof ITransitionGroupProps
   */
  readonly wrapWith?: IWrapperElement;
}

export const CSSTransitionGroup: React.FC<ITransitionGroupProps> = ({
  children,
  transitionName,
  transitionEnterTimeout,
  transitionLeaveTimeout,
  className,
  wrapWith,
  component = "span"
}) => {
  const Component = component;

  // Ensure the children we're working with is an array of ReactElements
  const arrayChildren = React.useMemo(() => toArray(children), [children]);

  // The previous children of the transition group
  // By default, we do NOT animate elements in on first render
  const oldChildren = React.useRef<Array<React.ReactElement>>(arrayChildren);

  // The children which have been removed by the containing component and are being animated out
  const [leavingChildren, setLeavingChildren] = React.useState<
    Array<IElementWithIndex>
  >([]);

  // The children which have been recently added by the containing component and are being animated in (key only)
  const [enteringChildren, setEnteringChildren] = React.useState<
    Set<React.Key>
  >(new Set());

  // The animated elements which are not yet active - i.e. they have just been added or removed
  const [inactiveChildren, setInactiveChildren] = React.useState<
    Set<React.Key>
  >(new Set());

  const [renderFlag, setRenderFlag] = React.useState<{}>({});

  // A store of the live enter/leave timeouts
  const liveTimeouts = React.useRef<Map<React.Key, number>>(new Map());
  const clearLiveTimeout = React.useCallback((key: React.Key) => {
    const currentTimeout = liveTimeouts.current.get(key);
    if (currentTimeout) {
      window.clearTimeout(currentTimeout);
    }
  }, []);
  // A store of activation timeouts
  const liveActivationTimeouts = React.useRef<Set<number>>(new Set());

  // Clear all timeouts on unmount
  React.useEffect(() => {
    Array.from(liveTimeouts.current.values()).forEach(timeout =>
      window.clearTimeout(timeout)
    );
    Array.from(liveActivationTimeouts.current.values()).forEach(timeout =>
      window.clearTimeout(timeout)
    );
  }, []);

  // remove a key from the enteringChildren set
  const settleEnteringChild = React.useCallback((key: React.Key) => {
    setEnteringChildren(localEnteringChildren => {
      const newEnteringChildren = new Set(localEnteringChildren);
      newEnteringChildren.delete(key);
      return newEnteringChildren;
    });
  }, []);
  // settle an element after the required delay
  const scheduleSettleEnteringChild = React.useCallback(
    (key: React.Key) => {
      clearLiveTimeout(key);
      liveTimeouts.current.set(
        key,
        window.setTimeout(
          () => settleEnteringChild(key),
          transitionEnterTimeout
        )
      );
    },
    [clearLiveTimeout, settleEnteringChild, transitionEnterTimeout]
  );

  // remove a key from the enteringChildren set
  const removeLeavingChild = React.useCallback((key: React.Key) => {
    setLeavingChildren(localLeavingChildren => {
      // Since the leavingChildren are ordered, any *after* the removed child should have their index reduced by 1
      let reduceIndex = 0;
      return localLeavingChildren.reduce(
        (
          remainingLeavingChildren: Array<IElementWithIndex>,
          { element, index }
        ) => {
          if (element.key === key) {
            reduceIndex = 1;
            return remainingLeavingChildren;
          }
          return remainingLeavingChildren.concat({
            element,
            index: index - reduceIndex
          });
        },
        []
      );
    });
  }, []);
  // remove an element after the required delay
  const scheduleRemoveLeavingChild = React.useCallback(
    (key: React.Key) => {
      clearLiveTimeout(key);
      liveTimeouts.current.set(
        key,
        window.setTimeout(() => removeLeavingChild(key), transitionLeaveTimeout)
      );
    },
    [clearLiveTimeout, removeLeavingChild, transitionLeaveTimeout]
  );

  // Get newly added children (with index)
  const addedChildren = React.useMemo(
    () => elementDiff(arrayChildren, oldChildren.current),
    [arrayChildren]
  );

  // Update the current record of entering children with the newly added children
  React.useEffect(() => {
    if (addedChildren.length) {
      const addedKeys = new Set(
        addedChildren.map(({ element }) => element.key)
      );

      setEnteringChildren(localEnteringChildren => {
        addedChildren.forEach(({ element }) => {
          localEnteringChildren.add(element.key!);
          scheduleSettleEnteringChild(element.key!);
        });
        return localEnteringChildren;
      });
      // This element is no longer leaving (if it ever was)
      setLeavingChildren(localLeavingChildren => {
        return localLeavingChildren.filter(child => {
          return !addedKeys.has(child.element.key);
        });
      });
      setInactiveChildren(localInactiveChildren => {
        const newInactiveChildren = new Set(localInactiveChildren);
        addedChildren.forEach(({ element }) => {
          newInactiveChildren.add(element.key!);
        });
        return newInactiveChildren;
      });
    }
  }, [addedChildren, scheduleSettleEnteringChild]);

  // Get newly removed children (with index)
  // Update the current record of leaving children with the newly removed children
  React.useLayoutEffect(() => {
    const removedChildren = elementDiff(oldChildren.current, arrayChildren);
    if (removedChildren.length) {
      removedChildren.forEach(({ element }) =>
        scheduleRemoveLeavingChild(element.key!)
      );
      setLeavingChildren(localLeavingChildren =>
        mergeInRemovedChildren(removedChildren, localLeavingChildren)
      );
      setInactiveChildren(localInactiveChildren => {
        const newInactiveChildren = new Set(localInactiveChildren);
        removedChildren.forEach(({ element }) => {
          newInactiveChildren.add(element.key!);
        });
        return newInactiveChildren;
      });
    }
  }, [arrayChildren, scheduleRemoveLeavingChild, setLeavingChildren]);

  const childrenToRender = React.useMemo(() => {
    const childrenToRenderLength =
      oldChildren.current.length + leavingChildren.length;
    const localChildrenToRender: Array<React.ReactElement> = new Array(
      childrenToRenderLength
    );
    // First add the leaving children at the correct indices
    leavingChildren.forEach(({ element, index }) => {
      const isInactive = inactiveChildren.has(element.key!);
      localChildrenToRender[index] = cloneWithClassName(
        element,
        `${transitionName}-leave ${
          isInactive ? "" : `${transitionName}-leave-active`
        }`,
        wrapWith
      );
    });
    // Then fill in the gaps with the still-existing children
    for (
      let index = 0, childIndex = 0;
      index < childrenToRenderLength;
      index++
    ) {
      if (!localChildrenToRender[index]) {
        const child = oldChildren.current[childIndex];
        const isEntering = enteringChildren.has(child.key!);
        const isInactive = inactiveChildren.has(child.key!);
        const childClassName = isEntering
          ? isInactive
            ? `${transitionName}-enter`
            : `${transitionName}-enter ${transitionName}-enter-active`
          : "";
        localChildrenToRender[index] = cloneWithClassName(
          oldChildren.current[childIndex],
          childClassName,
          wrapWith
        );
        childIndex++;
      }
    }

    return localChildrenToRender;
  }, [
    transitionName,
    leavingChildren,
    enteringChildren,
    inactiveChildren,
    arrayChildren,
    renderFlag
  ]);

  // Set the oldChildren to be the current children for the next render
  // and force a rerender
  React.useEffect(() => {
    oldChildren.current = arrayChildren;
    setRenderFlag({});
  }, [arrayChildren]);

  // Make any currently inactive children active, as they'll have been rendered once by now.
  // The update needs TWO animation frames as we have to guarantee that the component will have
  // been painted with the inactive class name before we add the active class.
  if (inactiveChildren.size) {
    liveActivationTimeouts.current.add(
      window.requestAnimationFrame(() =>
        liveActivationTimeouts.current.add(
          window.requestAnimationFrame(() => {
            setInactiveChildren(currentInactiveChildren => {
              const newInactiveChildren = new Set(currentInactiveChildren);
              [...inactiveChildren].forEach(key =>
                newInactiveChildren.delete(key)
              );
              return newInactiveChildren;
            });
          })
        )
      )
    );
  }

  return <Component className={className}>{childrenToRender}</Component>;
};

interface IElementWithIndex {
  readonly element: React.ReactElement;
  readonly index: number;
}

// Compare two lists of ReactElements by key
function elementDiff(
  comparedItems: Array<React.ReactElement>,
  compareWith: Array<React.ReactElement>
): Array<IElementWithIndex> {
  const compareWithKeys = new Set(compareWith.map(element => element.key));
  const diff = comparedItems
    .map((element, index) => ({ element, index }))
    .filter(({ element }) => !compareWithKeys.has(element.key));
  return diff.length ? diff : EMPTY_ARRAY;
}

// Map either a single React Element or an array to a new array of React Elements
function toArray(
  elements:
    | React.ReactElement
    | Array<React.ReactElement | null>
    | undefined
    | null
) {
  return elements
    ? elements instanceof Array
      ? elements.length
        ? elements.filter(Boolean)
        : EMPTY_ARRAY
      : [elements]
    : EMPTY_ARRAY;
}

// Add any newly removed children to the `leavingChildren` array.
// We need to update the newly leaving children (which will have indices related to their last position in the component's children)
// so that their indices reflect any *already* leaving children, which are no longer in the `children` array, but will still be
// rendered until they've been removed from `leavingChildren`.
function mergeInRemovedChildren(
  removedChildren: Array<IElementWithIndex>,
  leavingChildren: Array<IElementWithIndex>
) {
  return [...leavingChildren]
    .concat(
      removedChildren.map(({ element, index }) => {
        let indexPush = 0;
        leavingChildren.forEach(({ index: leavingChildIndex }) => {
          if (leavingChildIndex <= index + indexPush) {
            indexPush++;
          }
        });
        return { element, index: index + indexPush };
      })
    )
    .sort(({ index: indexA }, { index: indexB }) => indexA - indexB);
}

function cloneWithClassName(
  element: React.ReactElement,
  className: string,
  wrapWith?: IWrapperElement
) {
  const { className: elementClassName = "", children } = element.props;
  return wrapWith ? (
    <wrapWith.Element
      key={element.key || undefined}
      className={`${wrapWith.className || ""} ${className}`}
    >
      {element}
    </wrapWith.Element>
  ) : (
    React.cloneElement(
      element,
      { className: `${elementClassName} ${className}` },
      children
    )
  );
}
